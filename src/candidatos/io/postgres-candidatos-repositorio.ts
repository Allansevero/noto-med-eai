/**
 * Implementação PostgreSQL do repositório de candidatos a emissão de notas fiscais.
 * Gerencia persistência, verificação estrita de faturamento anterior, busca por variantes
 * de telefone brasileiro e mineração automática de CPF no histórico da conversa.
 */

import type pg from 'pg';
import { gerarHashCpf } from '../../paciente/hash-cpf.js';
import { extrairCpfConversaSegura } from '../../paciente/extrair-cpf-texto.js';
import { extrairTextoPayloadBruto } from '../../whatsapp/payload-webhook-schema.js';
import { gerarVariantesTelefoneBrasileiro } from '../../whatsapp/variantes-telefone-brasileiro.js';
import type {
  CandidatoEmissao,
  CriarCandidatoParams,
  StatusCandidatoEmissao
} from '../tipos.js';
import type {
  CandidatosRepositorio,
  MensagemConversaRegistro,
  PacienteDadosBasicos,
  MedicoDadosBasicos
} from './candidatos-repositorio.js';

export class PostgresCandidatosRepositorio implements CandidatosRepositorio {
  constructor(
    private readonly pool: pg.Pool,
    private readonly pepper: string,
    private readonly chaveCriptografia?: string
  ) {}

  async salvarCandidato(params: CriarCandidatoParams): Promise<CandidatoEmissao> {
    const dadosComData =
      params.dadosBrutos && typeof params.dadosBrutos === 'object'
        ? { ...(params.dadosBrutos as Record<string, unknown>), ...(params.dataConsulta ? { dataConsulta: params.dataConsulta } : {}) }
        : params.dataConsulta
          ? { dataConsulta: params.dataConsulta }
          : params.dadosBrutos ?? null;

    const sql = `
      insert into candidatos_emissao (
        medico_id, paciente_id, mensagem_id, conversa_id, telefone_paciente,
        nome_paciente, valor_centavos, data_pagamento, id_transacao,
        tipo_pagamento, dados_brutos, referencia_externa, status
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pendente_aprovacao')
      on conflict (medico_id, mensagem_id) do update set
        valor_centavos = excluded.valor_centavos,
        nome_paciente = coalesce(excluded.nome_paciente, candidatos_emissao.nome_paciente),
        dados_brutos = coalesce(excluded.dados_brutos, candidatos_emissao.dados_brutos),
        atualizado_em = now()
      returning *
    `;
    const valores = [
      params.medicoId,
      params.pacienteId ?? null,
      params.mensagemId,
      params.conversaId,
      params.telefonePaciente,
      params.nomePaciente ?? null,
      params.valorCentavos,
      params.dataPagamento ?? null,
      params.idTransacao ?? null,
      params.tipoPagamento ?? 'pix',
      dadosComData ? JSON.stringify(dadosComData) : null,
      params.referenciaExterna
    ];

    const { rows } = await this.pool.query(sql, valores);
    return mapearLinhaCandidato(rows[0]);
  }

  async buscarCandidatoPorMensagem(medicoId: string, mensagemId: string): Promise<CandidatoEmissao | null> {
    const sql = `select * from candidatos_emissao where medico_id = $1 and mensagem_id = $2 limit 1`;
    const { rows } = await this.pool.query(sql, [medicoId, mensagemId]);
    if (rows.length === 0) return null;
    return mapearLinhaCandidato(rows[0]);
  }

  async buscarCandidatoPorTxid(medicoId: string, txid: string): Promise<CandidatoEmissao | null> {
    if (!txid) return null;
    const sql = `select * from candidatos_emissao where medico_id = $1 and id_transacao = $2 limit 1`;
    const { rows } = await this.pool.query(sql, [medicoId, txid]);
    if (rows.length === 0) return null;
    return mapearLinhaCandidato(rows[0]);
  }

  async buscarUltimoAguardandoAprovacao(medicoId: string): Promise<CandidatoEmissao | null> {
    const sql = `
      select * from candidatos_emissao
      where medico_id = $1 and status = 'pendente_aprovacao'
      order by criado_em desc
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [medicoId]);
    if (rows.length === 0) return null;
    return mapearLinhaCandidato(rows[0]);
  }

  async atualizarStatus(
    id: string,
    status: StatusCandidatoEmissao,
    extra?: { solicitacaoId?: string; valorCentavos?: number }
  ): Promise<void> {
    const sql = `
      update candidatos_emissao
      set status = $2,
          solicitacao_id = coalesce($3, solicitacao_id),
          valor_centavos = coalesce($4, valor_centavos),
          respondido_em = case when $2 in ('aprovado', 'recusado') then now() else respondido_em end,
          atualizado_em = now()
      where id = $1
    `;
    await this.pool.query(sql, [
      id,
      status,
      extra?.solicitacaoId ?? null,
      extra?.valorCentavos ?? null
    ]);
  }

  async marcarNotificado(id: string): Promise<void> {
    await this.pool.query(
      `update candidatos_emissao set notificado_em = now(), atualizado_em = now() where id = $1`,
      [id]
    );
  }

  async buscarMensagensConversa(conversaId: string): Promise<MensagemConversaRegistro[]> {
    const sql = `
      select id, direcao, tipo_mensagem, conteudo, criado_em, payload_bruto
      from whatsapp_mensagens
      where conversa_id = $1
      order by criado_em asc
    `;
    const { rows } = await this.pool.query(sql, [conversaId]);
    return rows.map(r => ({
      id: r.id,
      direcao: r.direcao as 'enviada' | 'recebida',
      tipo: r.tipo_mensagem as 'texto' | 'imagem' | 'documento' | 'outro',
      conteudo: r.conteudo || extrairTextoPayloadBruto(r.payload_bruto),
      criadoEm: r.criado_em instanceof Date ? r.criado_em : new Date(r.criado_em),
      payloadBruto: r.payload_bruto
    }));
  }

  async buscarPacientePorTelefone(medicoId: string, telefone: string): Promise<PacienteDadosBasicos | null> {
    const variantes = gerarVariantesTelefoneBrasileiro(telefone);
    const limpo = telefone.replace(/\D/g, '');
    const telBusca = limpo.startsWith('55') ? limpo.slice(2) : limpo;

    const sql = `
      select id, nome, telefone,
             case
               when $3::text is not null and cpf_cnpj_encriptado is not null then
                 pgp_sym_decrypt(cpf_cnpj_encriptado, $3::text)
               else null
             end as cpf_limpo
      from pacientes
      where medico_id = $1
        and (telefone = any($4::text[]) or telefone like '%' || $2 || '%')
      order by (cpf_cnpj_encriptado is not null) desc, nome_validado desc, atualizado_em desc
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [
      medicoId,
      telBusca,
      this.chaveCriptografia ?? null,
      variantes
    ]);
    if (rows.length === 0) return null;

    let cpfLimpo: string | null = rows[0].cpf_limpo || null;
    if (!cpfLimpo) {
      cpfLimpo = await this.minerarCpfDaConversaPorTelefone(medicoId, telBusca, variantes);
      if (cpfLimpo) {
        await this.salvarCpfPaciente(medicoId, rows[0].id, cpfLimpo);
      }
    }

    return {
      id: rows[0].id,
      nome: rows[0].nome,
      cpfLimpo,
      telefone: rows[0].telefone
    };
  }

  private async minerarCpfDaConversaPorTelefone(
    medicoId: string,
    telBusca: string,
    variantes: string[]
  ): Promise<string | null> {
    const sqlMsgs = `
      select m.direcao, m.conteudo, m.payload_bruto
      from whatsapp_mensagens m
      join whatsapp_conversas c on c.id = m.conversa_id
      where c.medico_id = $1
        and (c.contato_telefone = any($3::text[]) or c.contato_telefone like '%' || $2 || '%')
      order by m.criado_em asc
    `;
    const { rows } = await this.pool.query(sqlMsgs, [medicoId, telBusca, variantes]);
    if (rows.length === 0) return null;

    for (const r of rows) {
      const comp = r.payload_bruto?.comprovante;
      const cpfMidia = comp?.tomadorCpf || comp?.pagadorCpf;
      if (typeof cpfMidia === 'string' && cpfMidia.length === 11) {
        return cpfMidia;
      }
    }

    return extrairCpfConversaSegura(
      rows.map(r => ({
        direcao: r.direcao as 'recebida' | 'enviada',
        texto: r.conteudo || extrairTextoPayloadBruto(r.payload_bruto)
      }))
    );
  }

  async salvarCpfPaciente(medicoId: string, pacienteId: string, cpfLimpo: string): Promise<void> {
    const hash = gerarHashCpf(cpfLimpo, this.pepper);
    if (this.chaveCriptografia) {
      await this.pool.query(
        `update pacientes
         set cpf_cnpj_hash = $2,
             cpf_cnpj_encriptado = pgp_sym_encrypt($3, $4),
             atualizado_em = now()
         where id = $1 and medico_id = $5`,
        [pacienteId, hash, cpfLimpo, this.chaveCriptografia, medicoId]
      );
    } else {
      await this.pool.query(
        `update pacientes
         set cpf_cnpj_hash = $2,
             atualizado_em = now()
         where id = $1 and medico_id = $3`,
        [pacienteId, hash, medicoId]
      );
    }
  }

  async jaExisteFaturamento(
    medicoId: string,
    params: {
      txid?: string | null;
      referenciaExterna: string;
      telefonePaciente: string;
      valorCentavos: number;
    }
  ): Promise<boolean> {
    const { rows: refRows } = await this.pool.query(
      `select id from solicitacoes_nota where medico_id = $1 and referencia_externa = $2 limit 1`,
      [medicoId, params.referenciaExterna]
    );
    if (refRows.length > 0) return true;

    if (params.txid) {
      const { rows: txRows } = await this.pool.query(
        `select id from candidatos_emissao
         where medico_id = $1 and id_transacao = $2 and status in ('aprovado', 'emitido', 'ja_faturado')
         limit 1`,
        [medicoId, params.txid]
      );
      if (txRows.length > 0) return true;
    }

    return false;
  }

  async obterDadosMedico(medicoId: string): Promise<MedicoDadosBasicos | null> {
    const sql = `
      select m.id, m.nome_completo, u.telefone
      from medicos m
      join usuarios u on u.id = m.usuario_id
      where m.id = $1
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [medicoId]);
    if (rows.length === 0) return null;
    return {
      id: rows[0].id,
      nomeCompleto: rows[0].nome_completo,
      telefone: rows[0].telefone
    };
  }
}

function mapearLinhaCandidato(row: any): CandidatoEmissao {
  const dataPagIso = row.data_pagamento
    ? (row.data_pagamento instanceof Date ? row.data_pagamento.toISOString().split('T')[0] : String(row.data_pagamento).slice(0, 10))
    : null;
  const dataConsultaBr =
    typeof row.dados_brutos?.dataConsulta === 'string'
      ? row.dados_brutos.dataConsulta
      : dataPagIso
        ? formatarIsoParaBr(dataPagIso)
        : null;

  return {
    id: row.id,
    medicoId: row.medico_id,
    pacienteId: row.paciente_id,
    mensagemId: row.mensagem_id,
    conversaId: row.conversa_id,
    telefonePaciente: row.telefone_paciente,
    nomePaciente: row.nome_paciente,
    valorCentavos: row.valor_centavos,
    dataPagamento: dataPagIso,
    dataConsulta: dataConsultaBr,
    idTransacao: row.id_transacao,
    tipoPagamento: row.tipo_pagamento,
    status: row.status,
    referenciaExterna: row.referencia_externa,
    solicitacaoId: row.solicitacao_id,
    notificadoEm: row.notificado_em,
    respondidoEm: row.respondido_em,
    criadoEm: row.criado_em,
    atualizadoEm: row.atualizado_em
  };
}

function formatarIsoParaBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

