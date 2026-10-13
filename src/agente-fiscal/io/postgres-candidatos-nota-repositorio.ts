/**
 * Repositório Postgres para o Agente Fiscal acionador de notas.
 * Fornece I/O para leitura de conversas e mensagens com pacientes, checagem
 * de duplicidade de notas fiscais, persistência da memória contextual e enfileiramento.
 */

import type pg from 'pg';
import type { CandidatoNotaFiscal, MensagemContextoConversa } from '../regras/correlacionar-consulta-pagamento.js';
import { gerarHashCpf } from '../../paciente/hash-cpf.js';

export interface ConversaComHistorico {
  conversaId: string;
  contatoTelefone: string;
  contatoNome?: string | null;
  pacienteId?: string | null;
  pacienteNomeCadastrado?: string | null;
  mensagens: MensagemContextoConversa[];
}

export interface CandidatoMemoriaContextual {
  id?: string;
  medicoId: string;
  pacienteNome: string;
  pacienteTelefone: string;
  valorCentavos: number;
  valorFormatado: string;
  dataConsulta: string;
  dataConsultaIso: string;
  origemEvidencia?: Record<string, unknown>;
  criadoEm?: Date;
}

export class PostgresCandidatosNotaRepositorio {
  constructor(
    private readonly pool: pg.Pool,
    private readonly pepper: string
  ) {}

  /**
   * Busca todas as conversas do médico com seus pacientes e o respectivo histórico de mensagens.
   */
  async buscarConversasComHistorico(medicoId: string, dataCorte?: Date): Promise<ConversaComHistorico[]> {
    const sqlConversas = `
      select c.id as conversa_id, c.contato_telefone, c.contato_nome, c.paciente_id,
             p.nome as paciente_nome_cadastrado
      from whatsapp_conversas c
      left join pacientes p on p.id = c.paciente_id
      where c.medico_id = $1
      order by c.ultima_mensagem_em desc nulls last
    `;
    const { rows: conversasRows } = await this.pool.query(sqlConversas, [medicoId]);
    if (conversasRows.length === 0) return [];

    const resultado: ConversaComHistorico[] = [];

    for (const conv of conversasRows) {
      let sqlMensagens = `
        select id, direcao, tipo_mensagem, conteudo, criado_em, payload_bruto
        from whatsapp_mensagens
        where conversa_id = $1
      `;
      const params: any[] = [conv.conversa_id];

      if (dataCorte) {
        sqlMensagens += ` and criado_em >= $2`;
        params.push(dataCorte);
      }

      sqlMensagens += ` order by criado_em asc`;
      const { rows: msgsRows } = await this.pool.query(sqlMensagens, params);

      resultado.push({
        conversaId: conv.conversa_id,
        contatoTelefone: conv.contato_telefone,
        contatoNome: conv.contato_nome,
        pacienteId: conv.paciente_id,
        pacienteNomeCadastrado: conv.paciente_nome_cadastrado,
        mensagens: msgsRows.map(m => ({
          id: m.id,
          direcao: m.direcao as 'enviada' | 'recebida',
          tipo: m.tipo_mensagem as 'texto' | 'imagem' | 'documento' | 'outro',
          conteudo: m.conteudo,
          criadoEm: m.criado_em,
          payloadBruto: m.payload_bruto
        }))
      });
    }

    return resultado;
  }

  /**
   * Checa se já existe nota fiscal emitida ou solicitação em fila para o paciente e valor.
   */
  async verificarSeJaPossuiNota(
    medicoId: string,
    pacienteTelefone: string,
    valorCentavos: number
  ): Promise<boolean> {
    const limpo = pacienteTelefone.replace(/\D/g, '');
    const telBusca = limpo.startsWith('55') ? limpo.slice(2) : limpo;

    const sqlSol = `
      select s.id from solicitacoes_nota s
      left join pacientes p on p.id = s.paciente_id
      where s.medico_id = $1
        and s.valor_servico_centavos = $2
        and (p.telefone like '%' || $3 || '%' or s.xdesc_serv like '%' || $3 || '%')
        and s.status in ('pronta', 'emitida', 'pendente', 'simulada')
      limit 1
    `;
    const { rows: solRows } = await this.pool.query(sqlSol, [medicoId, valorCentavos, telBusca]);
    if (solRows.length > 0) return true;

    const sqlDisp = `
      select id from auditoria
      where acao = 'agente_fiscal_candidato_dispensado'
        and entidade_id = $1
        and dados_novos->'candidato'->>'pacienteTelefone' like '%' || $2 || '%'
      limit 1
    `;
    const { rows: dispRows } = await this.pool.query(sqlDisp, [medicoId, telBusca]);
    return dispRows.length > 0;
  }

  /**
   * Registra a dispensa de um candidato quando o médico recusa a emissão.
   */
  async dispensarCandidato(
    medicoId: string,
    candidato: CandidatoMemoriaContextual
  ): Promise<void> {
    const estadoJson = {
      status: 'dispensada',
      candidato,
      dispensadaEm: new Date().toISOString()
    };
    await this.pool.query(
      `insert into auditoria (acao, entidade, entidade_id, dados_novos)
       values ('agente_fiscal_candidato_dispensado', 'medicos', $1, $2::jsonb)`,
      [medicoId, JSON.stringify(estadoJson)]
    );
    await this.pool.query(
      `update noto_assistente_sessoes set estado = $2::jsonb, atualizado_em = now() where medico_id = $1`,
      [medicoId, JSON.stringify(estadoJson)]
    );
  }

  /**
   * Salva o candidato encontrado na memória contextual aguardando o "sim" do médico.
   */
  async salvarCandidatoAguardandoAprovacao(
    medicoId: string,
    candidato: CandidatoNotaFiscal
  ): Promise<void> {
    const estadoJson = {
      candidato,
      status: 'aguardando_aprovacao',
      atualizadoEm: new Date().toISOString()
    };

    // 1. Gravar em emissoes_pendentes_confirmacoes com estado aceito pelo CHECK constraint
    await this.pool.query(
      `insert into emissoes_pendentes_confirmacoes (
        medico_id, estado, capturada_em, atualizado_em, mensagem_confirmacao_id
      ) values ($1, 'enviado', now(), now(), $2)
      on conflict (medico_id) do update set
        estado = 'enviado',
        atualizado_em = now(),
        mensagem_confirmacao_id = excluded.mensagem_confirmacao_id`,
      [medicoId, candidato.origemEvidencia.mensagemPagamentoId]
    );

    // 2. Gravar o payload rico do candidato em noto_assistente_sessoes (coluna estado é jsonb)
    await this.pool.query(
      `insert into noto_assistente_sessoes (medico_id, versao, estado, atualizado_em)
       values ($1, 1, $2::jsonb, now())
       on conflict (medico_id) do update set
         versao = noto_assistente_sessoes.versao + 1,
         estado = excluded.estado,
         atualizado_em = now()`,
      [medicoId, JSON.stringify(estadoJson)]
    );

    // 3. Também preserva na tabela de auditoria para histórico e rastreabilidade
    await this.pool.query(
      `insert into auditoria (acao, entidade, entidade_id, dados_novos)
       values ('agente_fiscal_candidato_encontrado', 'medicos', $1, $2::jsonb)`,
      [medicoId, JSON.stringify(estadoJson)]
    );
  }

  /**
   * Recupera o candidato ativo da memória contextual aguardando confirmação.
   */
  async obterCandidatoAguardandoAprovacao(medicoId: string): Promise<CandidatoMemoriaContextual | null> {
    const sql = `
      select estado, atualizado_em from noto_assistente_sessoes
      where medico_id = $1
      limit 1
    `;
    const { rows } = await this.pool.query(sql, [medicoId]);
    if (rows.length === 0 || !rows[0].estado) return null;

    try {
      const estado = rows[0].estado;
      if (estado.status !== 'aguardando_aprovacao' || !estado.candidato) return null;
      return {
        medicoId,
        ...estado.candidato,
        criadoEm: rows[0].atualizado_em
      };
    } catch {
      return null;
    }
  }

  /**
   * Enfileira a solicitação de nota fiscal na fila de emissão após aprovação do médico.
   */
  async enfileirarEmissaoAprovada(
    medicoId: string,
    candidato: CandidatoMemoriaContextual
  ): Promise<{ solicitacaoId: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      // 1. Obter perfil fiscal do médico
      const sqlPerfil = `
        select f.ctrib_nac, f.cnbs, p.cclass_trib_padrao, p.cind_op_padrao, m.nome_completo
        from medicos m
        left join medico_perfil_fiscal p on p.medico_id = m.id
        left join medico_servicos_fiscais f on f.medico_id = m.id and f.padrao = true and f.ativo = true
        where m.id = $1 limit 1
      `;
      const { rows: perfilRows } = await client.query(sqlPerfil, [medicoId]);
      const perfil = perfilRows[0] || {};

      // 2. Localizar ou registrar paciente
      let pacienteId: string;
      const telLimpo = candidato.pacienteTelefone.replace(/\D/g, '');
      const sqlBuscaPac = `select id from pacientes where medico_id = $1 and telefone like '%' || $2 || '%' limit 1`;
      const { rows: pacRows } = await client.query(sqlBuscaPac, [medicoId, telLimpo]);

      if (pacRows.length > 0) {
        pacienteId = pacRows[0].id;
      } else {
        const cpfFake = gerarHashCpf(telLimpo, this.pepper);
        const sqlInsPac = `
          insert into pacientes (medico_id, nome, telefone, cpf_cnpj_hash, origem_cadastro)
          values ($1, $2, $3, $4, 'agente_fiscal')
          returning id
        `;
        const ins = await client.query(sqlInsPac, [medicoId, candidato.pacienteNome, telLimpo, cpfFake]);
        pacienteId = ins.rows[0].id;
      }

      // 3. Montar descrição do serviço
      const xdescServ = `CONSULTA MEDICA REALIZADA EM ${candidato.dataConsulta} COM DR(A) ${perfil.nome_completo || 'MEDICO(A)'}`;

      // 4. Inserir em solicitacoes_nota
      const sqlSol = `
        insert into solicitacoes_nota (
          medico_id, paciente_id, valor_servico_centavos, xdesc_serv,
          ctrib_nac, cnbs, cclass_trib, cind_op, origem, status, fila,
          datas_consulta_texto, competencia_emissao, tentativas
        ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'agente_fiscal', 'pronta', 'pronta', $9, $10, 0)
        returning id
      `;
      const solValues = [
        medicoId, pacienteId, candidato.valorCentavos, xdescServ,
        perfil.ctrib_nac || '040101', perfil.cnbs || '122051900',
        perfil.cclass_trib_padrao || '000001', perfil.cind_op_padrao || '100301',
        candidato.dataConsulta, candidato.dataConsultaIso
      ];
      const { rows: solRows } = await client.query(sqlSol, solValues);
      const solicitacaoId = solRows[0].id;

      // 5. Vincular serviço fiscal se existir
      await client.query(`
        update solicitacoes_nota s set servico_fiscal_id = f.id
        from medico_servicos_fiscais f
        where s.id = $1 and f.medico_id = $2 and f.padrao = true and f.ativo = true
      `, [solicitacaoId, medicoId]);

      // 6. Atualizar estado na memória contextual
      await client.query(`
        update emissoes_pendentes_confirmacoes
        set estado = 'confirmado', confirmado_em = now(), atualizado_em = now()
        where medico_id = $1
      `, [medicoId]);

      await client.query(`
        update noto_assistente_sessoes
        set estado = $2::jsonb, atualizado_em = now()
        where medico_id = $1
      `, [medicoId, JSON.stringify({ status: 'aprovada', solicitacaoId, aprovadaEm: new Date().toISOString() })]);

      await client.query('commit');
      return { solicitacaoId };
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Obtém os dados do médico (nome completo e telefone) para envio da notificação.
   */
  async obterDadosMedico(medicoId: string): Promise<{
    nomeCompleto: string;
    telefone: string | null;
    valorPadraoCentavos?: number;
    fiscalConfirmado?: boolean;
    parametrosProntos?: boolean;
  } | null> {
    const sql = `
      select m.nome_completo, u.telefone,
             coalesce(pf.confirmado_pelo_medico, false) as fiscal_confirmado,
             (msf.parametros_emissao is not null) as parametros_prontos,
             (select f.valor_padrao_centavos from medico_servicos_fiscais f where f.medico_id = m.id and f.padrao = true and f.ativo = true limit 1) as valor_padrao_centavos
      from medicos m
      join usuarios u on u.id = m.usuario_id
      left join medico_perfil_fiscal pf on pf.medico_id = m.id
      left join medico_servicos_fiscais msf on msf.medico_id = m.id and msf.padrao = true and msf.ativo = true
      where m.id = $1 limit 1
    `;
    const { rows } = await this.pool.query(sql, [medicoId]);
    if (rows.length === 0) return null;
    return {
      nomeCompleto: rows[0].nome_completo,
      telefone: rows[0].telefone,
      valorPadraoCentavos: rows[0].valor_padrao_centavos ? Number(rows[0].valor_padrao_centavos) : undefined,
      fiscalConfirmado: Boolean(rows[0].fiscal_confirmado),
      parametrosProntos: Boolean(rows[0].parametros_prontos)
    };
  }
}
