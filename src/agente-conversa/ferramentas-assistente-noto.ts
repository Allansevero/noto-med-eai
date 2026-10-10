/**
 * Ferramentas (tools) operacionais disponibilizadas para o Noto Assistente:
 * 1. Busca online e salvamento de dados profissionais (CRM, RQE, Especialidade);
 * 2. Levantamento do resumo de pacientes cadastrados e histórico;
 * 3. Configuração de janela temporal de busca (período sem emitir notas);
 * 4. Varredura com IA de visão e filtragem cronológica de comprovantes sem nota;
 * 5. Solicitação humanizada de CPF ao paciente (sem se identificar como IA);
 * 6. Registro de preferência do médico quanto à data das consultas.
 */

import type pg from 'pg';
import type { BuscarMedicoOnlineProvider, DadosMedicoOnline } from '../medico/io/buscar-medico-online.js';
import type { PaligemmaComprovanteClient } from '../io/nvidia/paligemma-comprovante-client.js';
import {
  filtrarComprovantesSemNota,
  type ComprovantePendenteEmissao,
  type MensagemHistoricoConversa
} from '../comprovantes/regras/filtrar-comprovantes-sem-nota.js';
import {
  criarSolicitacaoComprovante,
  type EntradaCriarSolicitacaoComprovante,
  type ResultadoCriarSolicitacaoComprovante
} from '../comprovantes/regras/criar-solicitacao-comprovante.js';
import type { EnviarMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';

export interface ResumoPacientesMedico {
  totalPacientesCadastrados: number;
  totalNotasEmitidas: number;
  totalNotasPendentes: number;
}

export interface PreferenciaDataConsulta {
  preferencia: 'mesma_do_comprovante' | 'perguntar_uma_a_uma';
}

export class FerramentasAssistenteNoto {
  constructor(
    private readonly pool: pg.Pool,
    private readonly buscarMedicoOnlineProvider: BuscarMedicoOnlineProvider,
    private readonly paligemmaClient: PaligemmaComprovanteClient,
    private readonly enviadorMensagem: EnviarMensagemPaciente
  ) {}

  /**
   * Procura online o CRM e RQE do médico pelo nome completo.
   */
  async buscarDadosMedicoOnline(nomeCompleto: string, uf?: string): Promise<DadosMedicoOnline | null> {
    return this.buscarMedicoOnlineProvider.buscarPorNome(nomeCompleto, uf);
  }

  /**
   * Salva os dados cadastrais e profissionais confirmados pelo médico.
   */
  async salvarDadosMedico(medicoId: string, dados: {
    nomeCompleto?: string;
    crm?: string;
    rqe?: string | null;
    especialidade?: string | null;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const med = (await client.query('select usuario_id from medicos where id = $1', [medicoId])).rows[0];
      if (!med) throw new Error(`Médico ${medicoId} não encontrado.`);

      await client.query(
        `update medicos set
          nome_completo = coalesce($2, nome_completo),
          crm = coalesce($3, crm),
          rqe = case when $6::boolean then $4 else rqe end,
          especialidade = coalesce($5, especialidade),
          atualizado_em = now()
        where id = $1`,
        [medicoId, dados.nomeCompleto ?? null, dados.crm ?? null, dados.rqe ?? null, dados.especialidade ?? null, dados.rqe !== undefined]
      );

      if (dados.nomeCompleto) {
        await client.query(
          'update usuarios set nome = $2, atualizado_em = now() where id = $1',
          [med.usuario_id, dados.nomeCompleto]
        );
      }
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Obtém o panorama de pacientes e notas do médico na base.
   */
  async obterResumoPacientes(medicoId: string): Promise<ResumoPacientesMedico> {
    const totalPacientes = (await this.pool.query(
      'select count(*)::integer as total from pacientes where medico_id = $1',
      [medicoId]
    )).rows[0]?.total ?? 0;

    const totalNotasEmitidas = (await this.pool.query(
      `select count(*)::integer as total from notas_fiscais n
       join solicitacoes_nota s on s.id = n.solicitacao_id
       where s.medico_id = $1`,
      [medicoId]
    )).rows[0]?.total ?? 0;

    const totalNotasPendentes = (await this.pool.query(
      "select count(*)::integer as total from solicitacoes_nota where medico_id = $1 and status = 'pendente'",
      [medicoId]
    )).rows[0]?.total ?? 0;

    return {
      totalPacientesCadastrados: Number(totalPacientes),
      totalNotasEmitidas: Number(totalNotasEmitidas),
      totalNotasPendentes: Number(totalNotasPendentes)
    };
  }

  /**
   * Converte a resposta do médico sobre o tempo sem emitir notas em uma data de corte.
   */
  interpretarJanelaTempo(textoResposta: string, agora = new Date()): string {
    const t = textoResposta.toLowerCase();
    const d = new Date(agora);

    const matchMeses = t.match(/(\d+)\s*(?:m[eê]s|meses)/i);
    const matchSemanas = t.match(/(\d+)\s*(?:semana|semanas)/i);
    const matchDias = t.match(/(\d+)\s*(?:dia|dias)/i);

    if (matchMeses) {
      d.setMonth(d.getMonth() - Number(matchMeses[1]));
    } else if (matchSemanas) {
      d.setDate(d.getDate() - (Number(matchSemanas[1]) * 7));
    } else if (matchDias) {
      d.setDate(d.getDate() - Number(matchDias[1]));
    } else if (/janeiro/i.test(t)) {
      d.setMonth(0, 1);
    } else if (/fevereiro/i.test(t)) {
      d.setMonth(1, 1);
    } else if (/mar[cç]o/i.test(t)) {
      d.setMonth(2, 1);
    } else if (/ano|desde o ano passado/i.test(t)) {
      d.setFullYear(d.getFullYear() - 1);
    } else {
      // Padrão de 60 dias se não especificado com precisão
      d.setDate(d.getDate() - 60);
    }

    return d.toISOString().slice(0, 10);
  }

  /**
   * Solicita o CPF na conversa com o paciente sem revelar que é uma IA.
   * Soa como uma mensagem direta do médico ou do consultório.
   */
  async pedirCpfPaciente(params: {
    instanciaNome: string;
    pacienteTelefone: string;
    pacienteNome?: string;
  }): Promise<{ sucesso: boolean; erro?: string }> {
    const primeiroNome = params.pacienteNome?.trim().split(/\s+/)[0] || '';
    const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!';
    const mensagem = `${saudacao} Para eu emitir sua nota fiscal da consulta, você poderia me confirmar seu CPF por favor?`;

    const resultado = await this.enviadorMensagem.enviarTexto({
      instanciaNome: params.instanciaNome,
      contatoTelefone: params.pacienteTelefone,
      texto: mensagem
    });

    return { sucesso: resultado.sucesso, erro: resultado.erro };
  }

  /**
   * Salva a preferência do médico para datas de consulta em comprovantes:
   * 'mesma_do_comprovante' ou 'perguntar_uma_a_uma'.
   */
  async salvarPreferenciaDataConsulta(
    medicoId: string,
    preferencia: 'mesma_do_comprovante' | 'perguntar_uma_a_uma'
  ): Promise<void> {
    await this.pool.query(
      `insert into auditoria (acao, entidade, entidade_id, dados_novos)
       values ('preferencia_data_consulta', 'medicos', $1, $2::jsonb)`,
      [medicoId, JSON.stringify({ preferencia, atualizadoEm: new Date().toISOString() })]
    );
  }

  /**
   * Obtém o último estado de onboarding do médico registrado em auditoria.
   */
  async obterEstadoOnboarding(medicoId: string): Promise<Record<string, any> | null> {
    const res = await this.pool.query(
      `select dados_novos from auditoria
       where entidade = 'medicos' and entidade_id = $1 and acao = 'estado_onboarding_assistente'
       order by criado_em desc limit 1`,
      [medicoId]
    );
    return (res.rows[0]?.dados_novos as Record<string, any>) ?? null;
  }

  /**
   * Grava o estado atual da conversa de onboarding do médico em auditoria.
   */
  async salvarEstadoOnboarding(medicoId: string, estado: Record<string, any>): Promise<void> {
    await this.pool.query(
      `insert into auditoria (acao, entidade, entidade_id, dados_novos)
       values ('estado_onboarding_assistente', 'medicos', $1, $2::jsonb)`,
      [medicoId, JSON.stringify({ ...estado, atualizadoEm: new Date().toISOString() })]
    );
  }

  /**
   * Processa mensagens de uma conversa com um paciente, identificando comprovantes
   * via PaliGemma e aplicando a filtragem temporal de notas fiscais.
   */
  async processarConversaParaComprovantes(
    mensagens: MensagemHistoricoConversa[],
    dataCorte?: string
  ): Promise<ComprovantePendenteEmissao[]> {
    const mensagensProcessadas: MensagemHistoricoConversa[] = [];

    for (const msg of mensagens) {
      if (msg.tipo === 'imagem' && !msg.comprovante) {
        // Se a mensagem possui imagem em base64 e ainda não foi analisada
        const imagemB64 = (msg as any).imagemBase64;
        if (imagemB64) {
          try {
            const comp = await this.paligemmaClient.analisarImagem(imagemB64);
            mensagensProcessadas.push({ ...msg, comprovante: comp });
            continue;
          } catch (e) {
            console.warn(`[PaliGemma] Erro ao analisar imagem ${msg.id}:`, e);
          }
        }
      }
      mensagensProcessadas.push(msg);
    }

    return filtrarComprovantesSemNota(mensagensProcessadas, dataCorte);
  }

  /**
   * Registra a solicitação de nota a partir do comprovante aprovado pelo filtro sem nota.
   */
  async criarSolicitacaoDeComprovante(
    entrada: EntradaCriarSolicitacaoComprovante
  ): Promise<ResultadoCriarSolicitacaoComprovante> {
    return criarSolicitacaoComprovante(this.pool, this.enviadorMensagem, entrada);
  }
}
