/**
 * Repositório Postgres para o Agente Fiscal acionador de notas.
 * Fornece I/O para leitura de conversas e mensagens com pacientes, checagem
 * de duplicidade de notas fiscais, persistência da memória contextual e enfileiramento.
 */

import type pg from 'pg';
import type { CandidatoNotaFiscal, MensagemContextoConversa } from '../regras/correlacionar-consulta-pagamento.js';
import { gerarHashCpf } from '../../paciente/hash-cpf.js';
import { extrairCpfTexto } from '../../paciente/extrair-cpf-texto.js';

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

export interface ResultadoEnfileirarEmissao {
  solicitacaoId: string;
  aguardandoCpf: boolean;
  pacienteNome: string;
  pacienteTelefone: string;
  pacienteId: string;
}

export class PostgresCandidatosNotaRepositorio {
  constructor(
    private readonly pool: pg.Pool,
    private readonly pepper: string,
    private readonly chaveCriptografia: string = process.env.DB_ENCRYPTION_KEY || 'noto-dev-secret'
  ) {}

  /**
   * Busca todas as conversas do médico com seus pacientes e o respectivo histórico de mensagens.
   */
  async buscarConversasComHistorico(medicoId: string, dataCorte?: Date): Promise<ConversaComHistorico[]> {
    let sqlConversas = `
      select c.id as conversa_id, c.contato_telefone, c.contato_nome, c.paciente_id,
             p.nome as paciente_nome_cadastrado
      from whatsapp_conversas c
      left join pacientes p on p.id = c.paciente_id
      where c.medico_id = $1
    `;
    const params: any[] = [medicoId];

    if (dataCorte) {
      sqlConversas += ` and (c.ultima_mensagem_em >= $2 or c.ultima_mensagem_em is null)`;
      params.push(dataCorte);
    }

    sqlConversas += ` order by c.ultima_mensagem_em desc nulls last`;
    const { rows: conversasRows } = await this.pool.query(sqlConversas, params);
    if (conversasRows.length === 0) return [];

    const resultado: ConversaComHistorico[] = [];

    for (const conv of conversasRows) {
      const sqlMensagens = `
        select id, direcao, tipo_mensagem, conteudo, criado_em, payload_bruto
        from whatsapp_mensagens
        where conversa_id = $1
        order by criado_em asc
      `;
      const { rows: msgsRows } = await this.pool.query(sqlMensagens, [conv.conversa_id]);

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
        and (
          s.status in ('pronta', 'emitida', 'pendente', 'simulada', 'excecao')
          or s.aguardando_confirmacao_medico = true
          or s.aguardando_cpf_medico = true
        )
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

    const telLimpo = (candidato.pacienteTelefone || '').replace(/\D/g, '');
    if (candidato.id) {
      await this.pool.query(
        `update solicitacoes_nota
         set aguardando_confirmacao_medico = false,
             aguardando_cpf_medico = false,
             status = 'excecao',
             fila = 'excecao',
             erro = 'Emissão dispensada pelo médico no WhatsApp',
             atualizado_em = now()
         where id = $1`,
        [candidato.id]
      );
    } else {
      await this.pool.query(
        `update solicitacoes_nota
         set aguardando_confirmacao_medico = false,
             aguardando_cpf_medico = false,
             status = 'excecao',
             fila = 'excecao',
             erro = 'Emissão dispensada pelo médico no WhatsApp',
             atualizado_em = now()
         where medico_id = $1
           and aguardando_confirmacao_medico = true
           and paciente_id in (select id from pacientes where telefone like '%' || $2 || '%')`,
        [medicoId, telLimpo]
      );
    }
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

    // 4. Salvar diretamente na tabela central solicitacoes_nota com aguardando_confirmacao_medico = true
    try {
      const telLimpo = candidato.pacienteTelefone.replace(/\D/g, '');
      let pacienteId: string;
      const { rows: pacRows } = await this.pool.query(
        `select id, nome from pacientes where medico_id = $1 and telefone like '%' || $2 || '%' limit 1`,
        [medicoId, telLimpo]
      );

      if (pacRows.length > 0) {
        pacienteId = pacRows[0].id;
        if ((!pacRows[0].nome || pacRows[0].nome === 'Paciente') && candidato.pacienteNome && candidato.pacienteNome !== 'Paciente') {
          await this.pool.query(
            `update pacientes set nome = $1, atualizado_em = now() where id = $2`,
            [candidato.pacienteNome, pacienteId]
          );
        }
      } else {
        const cpfFake = gerarHashCpf(telLimpo, this.pepper);
        const ins = await this.pool.query(
          `insert into pacientes (medico_id, nome, telefone, cpf_cnpj_hash, origem_cadastro)
           values ($1, $2, $3, $4, 'agente_fiscal')
           returning id`,
          [medicoId, candidato.pacienteNome, telLimpo, cpfFake]
        );
        pacienteId = ins.rows[0].id;
      }

      // Buscar perfil fiscal do médico para compor os dados da nota
      const { rows: perfilRows } = await this.pool.query(
        `select f.ctrib_nac, f.cnbs, p.cclass_trib_padrao, p.cind_op_padrao, m.nome_completo, f.id as servico_id
         from medicos m
         left join medico_perfil_fiscal p on p.medico_id = m.id
         left join medico_servicos_fiscais f on f.medico_id = m.id and f.padrao = true and f.ativo = true
         where m.id = $1 limit 1`,
        [medicoId]
      );
      const perfil = perfilRows[0] || {};
      const xdescServ = `CONSULTA MEDICA REALIZADA EM ${candidato.dataConsulta} COM DR(A) ${perfil.nome_completo || 'MEDICO(A)'}`;
      const refExt = candidato.origemEvidencia?.mensagemPagamentoId || null;

      const { rows: solExistente } = await this.pool.query(
        `select id from solicitacoes_nota
         where medico_id = $1 and paciente_id = $2 and valor_servico_centavos = $3
           and (referencia_externa = $4 or ($4 is null and aguardando_confirmacao_medico = true))
         limit 1`,
        [medicoId, pacienteId, candidato.valorCentavos, refExt]
      );

      if (solExistente.length === 0) {
        await this.pool.query(
          `insert into solicitacoes_nota (
            medico_id, paciente_id, valor_servico_centavos, xdesc_serv,
            ctrib_nac, cnbs, cclass_trib, cind_op, origem, status, fila,
            aguardando_confirmacao_medico, aguardando_cpf_medico,
            datas_consulta_texto, competencia_emissao, referencia_externa, servico_fiscal_id, tentativas
          ) values (
            $1, $2, $3, $4,
            $5, $6, $7, $8, 'agente_fiscal', 'pendente', 'pendente_cadastro',
            true, false,
            $9, $10, $11, $12, 0
          )`,
          [
            medicoId, pacienteId, candidato.valorCentavos, xdescServ,
            perfil.ctrib_nac || '040101', perfil.cnbs || '122051900',
            perfil.cclass_trib_padrao || '000001', perfil.cind_op_padrao || '100301',
            candidato.dataConsulta, candidato.dataConsultaIso, refExt, perfil.servico_id || null
          ]
        );
      }
    } catch (err) {
      console.warn('[PostgresCandidatosNotaRepositorio] Erro ao gravar candidato em solicitacoes_nota:', err);
    }
  }

  /**
   * Recupera o candidato ativo da memória contextual aguardando confirmação.
   */
  async obterCandidatoAguardandoAprovacao(medicoId: string): Promise<CandidatoMemoriaContextual | null> {
    const sqlSol = `
      select s.id, s.medico_id, s.paciente_id, s.valor_servico_centavos, s.xdesc_serv,
             s.datas_consulta_texto, s.competencia_emissao, s.referencia_externa, s.criado_em,
             p.nome as paciente_nome, p.telefone as paciente_telefone
      from solicitacoes_nota s
      join pacientes p on p.id = s.paciente_id
      where s.medico_id = $1 and s.aguardando_confirmacao_medico = true
      order by s.criado_em desc
      limit 1
    `;
    const { rows: solRows } = await this.pool.query(sqlSol, [medicoId]);
    if (solRows.length > 0) {
      const r = solRows[0];
      const valorReais = (r.valor_servico_centavos / 100).toFixed(2).replace('.', ',');
      return {
        id: r.id,
        medicoId: r.medico_id,
        pacienteNome: r.paciente_nome || 'Paciente',
        pacienteTelefone: r.paciente_telefone,
        valorCentavos: r.valor_servico_centavos,
        valorFormatado: valorReais,
        dataConsulta: r.datas_consulta_texto || '',
        dataConsultaIso: r.competencia_emissao ? new Date(r.competencia_emissao).toISOString() : new Date().toISOString(),
        origemEvidencia: { mensagemPagamentoId: r.referencia_externa },
        criadoEm: r.criado_em
      };
    }

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
  ): Promise<ResultadoEnfileirarEmissao> {
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
      let temCpfValido = false;
      const telLimpo = candidato.pacienteTelefone.replace(/\D/g, '');
      const sqlBuscaPac = `
        select id, nome, cpf_cnpj_hash,
               pgp_sym_decrypt(cpf_cnpj_encriptado, $3) as cpf_limpo
        from pacientes
        where medico_id = $1 and telefone like '%' || $2 || '%'
        limit 1
      `;
      const { rows: pacRows } = await client.query(sqlBuscaPac, [medicoId, telLimpo, this.chaveCriptografia]);

      if (pacRows.length > 0) {
        pacienteId = pacRows[0].id;
        let cpfLimpo = pacRows[0].cpf_limpo;

        // Se o paciente não tiver nome preenchido, atualiza com o nome do candidato
        if (!pacRows[0].nome && candidato.pacienteNome && candidato.pacienteNome !== 'Paciente') {
          await client.query(
            `update pacientes set nome = $1, atualizado_em = now() where id = $2`,
            [candidato.pacienteNome, pacienteId]
          );
        }

        // Se não possui CPF cadastrado, busca a fundo nas mensagens da conversa
        if (!cpfLimpo) {
          const sqlMsgs = `
            select m.conteudo, m.payload_bruto
            from whatsapp_mensagens m
            join whatsapp_conversas c on c.id = m.conversa_id
            where c.medico_id = $1 and c.contato_telefone like '%' || $2 || '%'
            order by m.criado_em desc
          `;
          const { rows: msgRows } = await client.query(sqlMsgs, [medicoId, telLimpo]);
          for (const row of msgRows) {
            const cpfCand =
              extrairCpfTexto(row.conteudo) ||
              extrairCpfTexto((row.payload_bruto as any)?.message?.conversation) ||
              extrairCpfTexto((row.payload_bruto as any)?.message?.extendedTextMessage?.text) ||
              extrairCpfTexto((row.payload_bruto as any)?.message?.imageMessage?.caption);
            if (cpfCand) {
              cpfLimpo = cpfCand;
              const cpfHash = gerarHashCpf(cpfCand, this.pepper);
              await client.query(
                `update pacientes
                 set cpf_cnpj_hash = $1,
                     cpf_cnpj_encriptado = pgp_sym_encrypt($2, $3),
                     atualizado_em = now()
                 where id = $4`,
                [cpfHash, cpfCand, this.chaveCriptografia, pacienteId]
              );
              break;
            }
          }
        }

        temCpfValido = Boolean(cpfLimpo);
      } else {
        const cpfFake = gerarHashCpf(telLimpo, this.pepper);
        const ins = await client.query(
          `insert into pacientes (medico_id, nome, telefone, cpf_cnpj_hash, origem_cadastro)
           values ($1, $2, $3, $4, 'agente_fiscal')
           returning id`,
          [medicoId, candidato.pacienteNome, telLimpo, cpfFake]
        );
        pacienteId = ins.rows[0].id;
        temCpfValido = false;
      }

      // 3. Montar descrição do serviço
      const xdescServ = `CONSULTA MEDICA REALIZADA EM ${candidato.dataConsulta} COM DR(A) ${perfil.nome_completo || 'MEDICO(A)'}`;

      // 4. Inserir ou atualizar em solicitacoes_nota respeitando a existência do CPF
      const statusFinal = temCpfValido ? 'pronta' : 'pendente';
      const filaFinal = temCpfValido ? 'pronta' : 'pendente_cadastro';
      let solicitacaoId: string;

      if (candidato.id) {
        solicitacaoId = candidato.id;
        await client.query(
          `update solicitacoes_nota
           set status = $1, fila = $2, aguardando_confirmacao_medico = false,
               aguardando_cpf_medico = false, atualizado_em = now()
           where id = $3`,
          [statusFinal, filaFinal, solicitacaoId]
        );
      } else {
        const { rows: solExistente } = await client.query(
          `select id from solicitacoes_nota
           where medico_id = $1 and paciente_id = $2 and aguardando_confirmacao_medico = true
           order by criado_em desc limit 1`,
          [medicoId, pacienteId]
        );

        if (solExistente.length > 0) {
          solicitacaoId = solExistente[0].id;
          await client.query(
            `update solicitacoes_nota
             set status = $1, fila = $2, aguardando_confirmacao_medico = false,
                 aguardando_cpf_medico = false, atualizado_em = now()
             where id = $3`,
            [statusFinal, filaFinal, solicitacaoId]
          );
        } else {
          const sqlSol = `
            insert into solicitacoes_nota (
              medico_id, paciente_id, valor_servico_centavos, xdesc_serv,
              ctrib_nac, cnbs, cclass_trib, cind_op, origem, status, fila,
              aguardando_confirmacao_medico, aguardando_cpf_medico,
              datas_consulta_texto, competencia_emissao, tentativas
            ) values ($1, $2, $3, $4, $5, $6, $7, $8, 'agente_fiscal', $9, $10, false, false, $11, $12, 0)
            returning id
          `;
          const solValues = [
            medicoId, pacienteId, candidato.valorCentavos, xdescServ,
            perfil.ctrib_nac || '040101', perfil.cnbs || '122051900',
            perfil.cclass_trib_padrao || '000001', perfil.cind_op_padrao || '100301',
            statusFinal, filaFinal,
            candidato.dataConsulta, candidato.dataConsultaIso
          ];
          const { rows: solRows } = await client.query(sqlSol, solValues);
          solicitacaoId = solRows[0].id;
        }
      }

      // 5. Vincular serviço fiscal se existir
      await client.query(`
        update solicitacoes_nota s set servico_fiscal_id = f.id
        from medico_servicos_fiscais f
        where s.id = $1 and f.medico_id = $2 and f.padrao = true and f.ativo = true
      `, [solicitacaoId, medicoId]);

      // 6. Se faltar CPF, marca a conversa como aguardando CPF
      if (!temCpfValido) {
        await client.query(`
          update whatsapp_conversas
          set aguardando_cpf_desde = now()
          where medico_id = $1 and contato_telefone like '%' || $2 || '%'
        `, [medicoId, telLimpo]);
      }

      // 7. Atualizar estado na memória contextual
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
      return {
        solicitacaoId,
        aguardandoCpf: !temCpfValido,
        pacienteNome: candidato.pacienteNome,
        pacienteTelefone: telLimpo,
        pacienteId
      };
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
    solicitarCpfDiretoPaciente?: boolean;
  } | null> {
    const sql = `
      select m.nome_completo, u.telefone,
             coalesce(m.solicitar_cpf_direto_paciente, false) as solicitar_cpf_direto_paciente,
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
      parametrosProntos: Boolean(rows[0].parametros_prontos),
      solicitarCpfDiretoPaciente: Boolean(rows[0].solicitar_cpf_direto_paciente)
    };
  }

  /**
   * Registra na memória contextual que o Noto está aguardando o médico informar o CPF do paciente.
   */
  async salvarAguardandoCpfMedico(
    medicoId: string,
    dados: { solicitacaoId: string; pacienteId: string; pacienteNome: string; pacienteTelefone: string }
  ): Promise<void> {
    await this.pool.query(
      `update solicitacoes_nota
       set aguardando_cpf_medico = true,
           aguardando_confirmacao_medico = false,
           atualizado_em = now()
       where id = $1`,
      [dados.solicitacaoId]
    );

    const estado = {
      status: 'aguardando_cpf_medico',
      ...dados,
      solicitadoEm: new Date().toISOString()
    };
    await this.pool.query(
      `update noto_assistente_sessoes
       set estado = $2::jsonb, atualizado_em = now()
       where medico_id = $1`,
      [medicoId, JSON.stringify(estado)]
    );
  }

  /**
   * Recupera os dados da solicitação que está aguardando o CPF do médico.
   */
  async obterAguardandoCpfMedico(
    medicoId: string
  ): Promise<{ solicitacaoId: string; pacienteId: string; pacienteNome: string; pacienteTelefone: string } | null> {
    const { rows: solRows } = await this.pool.query(
      `select s.id as solicitacao_id, s.paciente_id,
              p.nome as paciente_nome, p.telefone as paciente_telefone
       from solicitacoes_nota s
       join pacientes p on p.id = s.paciente_id
       where s.medico_id = $1 and s.aguardando_cpf_medico = true
       order by s.atualizado_em desc
       limit 1`,
      [medicoId]
    );
    if (solRows.length > 0) {
      return {
        solicitacaoId: solRows[0].solicitacao_id,
        pacienteId: solRows[0].paciente_id,
        pacienteNome: solRows[0].paciente_nome || 'Paciente',
        pacienteTelefone: solRows[0].paciente_telefone
      };
    }

    const { rows } = await this.pool.query(
      `select estado from noto_assistente_sessoes where medico_id = $1 limit 1`,
      [medicoId]
    );
    if (rows.length === 0 || !rows[0].estado) return null;
    const est = rows[0].estado;
    if (est.status !== 'aguardando_cpf_medico' || !est.pacienteId) return null;
    return {
      solicitacaoId: est.solicitacaoId,
      pacienteId: est.pacienteId,
      pacienteNome: est.pacienteNome,
      pacienteTelefone: est.pacienteTelefone
    };
  }

  /**
   * Limpa o estado de espera de CPF do médico.
   */
  async limparAguardandoCpfMedico(medicoId: string): Promise<void> {
    await this.pool.query(
      `update solicitacoes_nota
       set aguardando_cpf_medico = false,
           atualizado_em = now()
       where medico_id = $1 and aguardando_cpf_medico = true`,
      [medicoId]
    );

    await this.pool.query(
      `update noto_assistente_sessoes
       set estado = $2::jsonb, atualizado_em = now()
       where medico_id = $1`,
      [medicoId, JSON.stringify({ status: 'cpf_medico_cancelado', canceladoEm: new Date().toISOString() })]
    );
  }

  /**
   * Salva o CPF informado pelo médico para o paciente e libera a emissão da nota fiscal.
   */
  async salvarCpfPacienteELiberarSolicitacao(
    medicoId: string,
    pacienteId: string,
    cpfLimpo: string,
    solicitacaoId: string
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');

      const cpfHash = gerarHashCpf(cpfLimpo, this.pepper);
      await client.query(
        `update pacientes
         set cpf_cnpj_hash = $1,
             cpf_cnpj_encriptado = pgp_sym_encrypt($2, $3),
             atualizado_em = now()
         where id = $4`,
        [cpfHash, cpfLimpo, this.chaveCriptografia, pacienteId]
      );

      // Desmarca espera de CPF na conversa
      await client.query(
        `update whatsapp_conversas
         set aguardando_cpf_desde = null, atualizado_em = now()
         where paciente_id = $1 and medico_id = $2`,
        [pacienteId, medicoId]
      );

      // Libera as notas pendentes deste paciente
      const { rowCount } = await client.query(
        `update solicitacoes_nota
         set status = 'pronta', fila = 'pronta', aguardando_cpf_medico = false, erro = null, atualizado_em = now()
         where paciente_id = $1 and medico_id = $2 and (id = $3 or status in ('pendente', 'falhou') or aguardando_cpf_medico = true)`,
        [pacienteId, medicoId, solicitacaoId]
      );

      // Atualiza memória
      await client.query(
        `update noto_assistente_sessoes
         set estado = $2::jsonb, atualizado_em = now()
         where medico_id = $1`,
        [medicoId, JSON.stringify({ status: 'aprovada', solicitacaoId, aprovadaEm: new Date().toISOString() })]
      );

      await client.query('commit');
      return rowCount ?? 0;
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }
}
