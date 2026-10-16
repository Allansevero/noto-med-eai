/**
 * Implementação PostgreSQL do repositório de candidatos a emissão de notas fiscais.
 * Gerencia persistência, verificação estrita de faturamento anterior e dados de tomador
 * criptografados no banco de dados.
 */

import type pg from 'pg';
import { gerarHashCpf } from '../../paciente/hash-cpf.js';
import type {
  CandidatoEmissao,
  CriarCandidatoParams,
  StatusCandidatoEmissao
} from '../tipos.js';
import type {
  CandidatosRepositorio,
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
    const sql = `
      insert into candidatos_emissao (
        medico_id, paciente_id, mensagem_id, conversa_id, telefone_paciente,
        nome_paciente, valor_centavos, data_pagamento, id_transacao,
        tipo_pagamento, dados_brutos, referencia_externa, status
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pendente_aprovacao')
      on conflict (medico_id, mensagem_id) do update set
        valor_centavos = excluded.valor_centavos,
        nome_paciente = coalesce(excluded.nome_paciente, candidatos_emissao.nome_paciente),
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
      params.dadosBrutos ? JSON.stringify(params.dadosBrutos) : null,
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

  async buscarPacientePorTelefone(medicoId: string, telefone: string): Promise<PacienteDadosBasicos | null> {
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
      where medico_id = $1 and telefone like '%' || $2 || '%'
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [medicoId, telBusca, this.chaveCriptografia ?? null]);
    if (rows.length === 0) return null;

    return {
      id: rows[0].id,
      nome: rows[0].nome,
      cpfLimpo: rows[0].cpf_limpo,
      telefone: rows[0].telefone
    };
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
    // 1. Checagem direta por referência externa já existente
    const { rows: refRows } = await this.pool.query(
      `select id from solicitacoes_nota where medico_id = $1 and referencia_externa = $2 limit 1`,
      [medicoId, params.referenciaExterna]
    );
    if (refRows.length > 0) return true;

    // 2. Checagem por txid já registrado em candidato aprovado ou emitido
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
  return {
    id: row.id,
    medicoId: row.medico_id,
    pacienteId: row.paciente_id,
    mensagemId: row.mensagem_id,
    conversaId: row.conversa_id,
    telefonePaciente: row.telefone_paciente,
    nomePaciente: row.nome_paciente,
    valorCentavos: row.valor_centavos,
    dataPagamento: row.data_pagamento ? row.data_pagamento.toISOString().split('T')[0] : null,
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
