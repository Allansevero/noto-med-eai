/**
 * Orquestrador da conversa de onboarding entre o Noto Assistente e o médico.
 * Conduz as etapas de apresentação, busca e confirmação de CRM/RQE online,
 * levantamento de pacientes, definição da janela temporal de notas atrasadas
 * e alinhamento sobre as datas de consulta para emissão.
 */

import type { FerramentasAssistenteNoto } from './ferramentas-assistente-noto.js';

export type EtapaOnboardingAssistente =
  | 'apresentacao'
  | 'confirmacao_crm_rqe'
  | 'apresentar_pacientes_e_perguntar_janela'
  | 'aguardando_janela_tempo'
  | 'perguntar_preferencia_data'
  | 'concluido';

export interface EstadoAssistenteMedico {
  etapa: EtapaOnboardingAssistente;
  crmSugerido?: string;
  rqeSugerido?: string | null;
  especialidadeSugerida?: string | null;
  ufSugerida?: string;
  janelaDataCorte?: string;
}

export interface EntradaProcessamentoOnboarding {
  medicoId: string;
  nomeCompleto?: string;
  uf?: string;
  textoRecebido?: string;
  estadoAtual: EstadoAssistenteMedico;
}

export interface RespostaProcessamentoOnboarding {
  novoEstado: EstadoAssistenteMedico;
  mensagensEnviar: string[];
  acaoExecutada?: string;
}

function ehRespostaAfirmativa(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return /^(sim|s|pode|pode salvar|correto|t[aá] certo|isso|exato|positivo|confirmo|ok|beleza|show)$/i.test(t)
    || /\b(pode salvar|t[aá] correto|est[aá] certo|pode sim)\b/i.test(t);
}

export class GerenciadorConversaOnboarding {
  constructor(private readonly ferramentas: FerramentasAssistenteNoto) {}

  /**
   * Ponto de entrada quando o médico conecta a instância do WhatsApp.
   */
  async iniciarAoConectar(
    medicoId: string,
    nomeCompleto?: string,
    uf?: string
  ): Promise<RespostaProcessamentoOnboarding> {
    const mensagens: string[] = [];
    mensagens.push('Olá, doutor(a)! Sou o assistente do Noto. Estou aqui para cuidar da emissão das suas notas fiscais de consultas direto pelo WhatsApp.');

    if (!nomeCompleto || nomeCompleto.trim().split(/\s+/).length < 2) {
      mensagens.push('Para começarmos, como é o seu nome completo, como está no seu CRM?');
      return {
        novoEstado: { etapa: 'apresentacao' },
        mensagensEnviar: mensagens
      };
    }

    // Se já temos o nome completo, busca online o CRM/RQE
    return this.avancarParaBuscaCrm(medicoId, nomeCompleto, uf, mensagens);
  }

  /**
   * Processa a resposta enviada pelo médico durante o fluxo de onboarding.
   */
  async processarMensagemMedico(
    entrada: EntradaProcessamentoOnboarding
  ): Promise<RespostaProcessamentoOnboarding> {
    const texto = entrada.textoRecebido?.trim() || '';
    const estado = entrada.estadoAtual;

    switch (estado.etapa) {
      case 'apresentacao': {
        // O médico acabou de informar seu nome completo
        const nomeInformado = texto;
        return this.avancarParaBuscaCrm(entrada.medicoId, nomeInformado, entrada.uf);
      }

      case 'confirmacao_crm_rqe': {
        if (ehRespostaAfirmativa(texto)) {
          // Salva os dados confirmados
          await this.ferramentas.salvarDadosMedico(entrada.medicoId, {
            crm: estado.crmSugerido,
            rqe: estado.rqeSugerido,
            especialidade: estado.especialidadeSugerida
          });

          return this.avancarParaPacientesEJanela(entrada.medicoId);
        }

        // Se o médico disse que não está correto, pede para ele informar o CRM diretamente
        return {
          novoEstado: { ...estado, etapa: 'confirmacao_crm_rqe' },
          mensagensEnviar: ['Sem problemas! Qual é o número do seu CRM e estado (por exemplo: 12345/SP)?']
        };
      }

      case 'aguardando_janela_tempo': {
        // O médico respondeu há quanto tempo está sem emitir notas
        const dataCorte = this.ferramentas.interpretarJanelaTempo(texto);

        const mensagens = [
          'Entendido! Já configurei esse período e vou começar a varrer os comprovantes recebidos nas suas conversas.',
          'Antes de emitirmos as notas encontradas: você prefere que eu pergunte uma data por vez aos pacientes para confirmar o dia exato da consulta, ou posso colocar a data da consulta a mesma do comprovante de pagamento?'
        ];

        return {
          novoEstado: {
            ...estado,
            etapa: 'perguntar_preferencia_data',
            janelaDataCorte: dataCorte
          },
          mensagensEnviar: mensagens,
          acaoExecutada: `janela_configurada:${dataCorte}`
        };
      }

      case 'perguntar_preferencia_data': {
        const prefMesma = /mesma|comprovante|pagamento|mesmo dia/i.test(texto);
        const preferencia = prefMesma ? 'mesma_do_comprovante' : 'perguntar_uma_a_uma';

        await this.ferramentas.salvarPreferenciaDataConsulta(entrada.medicoId, preferencia);

        const confirmacao = preferencia === 'mesma_do_comprovante'
          ? 'Perfeito! Vou considerar a data do comprovante para a descrição das consultas.'
          : 'Combinado! Vou confirmar com cada paciente a data da consulta antes de gerar a nota.';

        return {
          novoEstado: { ...estado, etapa: 'concluido' },
          mensagensEnviar: [
            confirmacao,
            'Tudo configurado! Já estou monitorando suas conversas. Se faltar o CPF de algum paciente, eu mesmo peço educadamente na conversa para você.'
          ],
          acaoExecutada: `preferencia_salva:${preferencia}`
        };
      }

      default: {
        return {
          novoEstado: estado,
          mensagensEnviar: []
        };
      }
    }
  }

  private async avancarParaBuscaCrm(
    medicoId: string,
    nomeCompleto: string,
    uf?: string,
    mensagensAnteriores: string[] = []
  ): Promise<RespostaProcessamentoOnboarding> {
    const dadosOnline = await this.ferramentas.buscarDadosMedicoOnline(nomeCompleto, uf);

    if (dadosOnline && dadosOnline.crm) {
      const especialidadeTexto = dadosOnline.especialidade ? ` em ${dadosOnline.especialidade}` : '';
      const rqeTexto = dadosOnline.rqe ? `, RQE ${dadosOnline.rqe}` : '';

      return {
        novoEstado: {
          etapa: 'confirmacao_crm_rqe',
          crmSugerido: dadosOnline.crm,
          rqeSugerido: dadosOnline.rqe,
          especialidadeSugerida: dadosOnline.especialidade,
          ufSugerida: dadosOnline.uf
        },
        mensagensEnviar: [
          ...mensagensAnteriores,
          `Localizei seus registros: CRM ${dadosOnline.crm}/${dadosOnline.uf}${rqeTexto}${especialidadeTexto}. Está correto? Posso salvar no seu cadastro?`
        ]
      };
    }

    return {
      novoEstado: { etapa: 'confirmacao_crm_rqe' },
      mensagensEnviar: [
        ...mensagensAnteriores,
        `Prazer, Dr(a) ${nomeCompleto.split(' ')[0]}! Qual é o número do seu CRM e estado (por exemplo: 12345/SP)?`
      ]
    };
  }

  private async avancarParaPacientesEJanela(
    medicoId: string
  ): Promise<RespostaProcessamentoOnboarding> {
    const resumo = await this.ferramentas.obterResumoPacientes(medicoId);

    const textoPacientes = resumo.totalPacientesCadastrados > 0
      ? `Encontrei ${resumo.totalPacientesCadastrados} paciente(s) já cadastrados aqui na sua conta.`
      : 'Ainda não encontrei pacientes cadastrados na sua conta.';

    const mensagens = [
      'Prontinho, dados salvos!',
      `${textoPacientes} Talvez falte mais gente. Você pode subir uma planilha ou sincronizar pelas integrações, e eu também vou procurar aqui nas suas conversas do WhatsApp.`,
      'Para eu começar a busca: você sabe mais ou menos há quanto tempo está sem emitir notas?'
    ];

    return {
      novoEstado: { etapa: 'aguardando_janela_tempo' },
      mensagensEnviar: mensagens
    };
  }
}
