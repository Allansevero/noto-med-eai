/** O código controla as etapas; a NVIDIA redige com o guia noto-conversa.md. */
import type { FerramentasAssistenteNoto } from './ferramentas-assistente-noto.js';
import type { EventoComunicacaoNoto, GeradorMensagemNoto } from '../conversa/comunicador-noto.js';
import { nomeProfissionalValido } from '../conta/validar-dados-emissao.js';

export type EtapaOnboardingAssistente =
  | 'apresentacao' | 'confirmacao_crm_rqe' | 'apresentar_pacientes_e_perguntar_janela'
  | 'aguardando_janela_tempo' | 'perguntar_preferencia_data' | 'concluido';

export interface EstadoAssistenteMedico {
  etapa: EtapaOnboardingAssistente;
  nomeConfirmado?: string;
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
  estadoAtual?: EstadoAssistenteMedico;
}
export interface RespostaProcessamentoOnboarding {
  novoEstado: EstadoAssistenteMedico;
  mensagensEnviar: string[];
  acaoExecutada?: string;
}

type Objetivo = 'apresentar_e_pedir_nome' | 'pedir_nome' | 'confirmar_registros' | 'pedir_crm_uf'
  | 'informar_pacientes_e_pedir_periodo' | 'pedir_preferencia_data' | 'confirmar_preferencia';

function ehRespostaAfirmativa(texto: string): boolean {
  const t = texto.trim().toLowerCase();
  return /^(sim|s|pode|pode salvar|correto|t[aá] certo|isso|exato|positivo|confirmo|ok|beleza|show)$/i.test(t)
    || /\b(pode salvar|t[aá] correto|est[aá] certo|pode sim)\b/i.test(t);
}

export class GerenciadorConversaOnboarding {
  constructor(private readonly ferramentas: FerramentasAssistenteNoto,
    private readonly gerador: GeradorMensagemNoto) {}

  async iniciarAoConectar(medicoId: string, _nomeCadastrado?: string, _uf?: string,
    opcoes: { persistirEstado?: boolean } = {}): Promise<RespostaProcessamentoOnboarding> {
    // Nome cadastrado é provisório: não é usado como identidade nem enviado à IA.
    const resposta = await this.redigir({ etapa: 'apresentacao' }, 'apresentar_e_pedir_nome', 'pedir_nome');
    if (opcoes.persistirEstado !== false) {
      await this.ferramentas.salvarEstadoOnboarding(medicoId, resposta.novoEstado);
    }
    return resposta;
  }

  async processarMensagemMedico(entrada: EntradaProcessamentoOnboarding): Promise<RespostaProcessamentoOnboarding> {
    const texto = entrada.textoRecebido?.trim() || '';
    const estadoSalvo = await this.ferramentas.obterEstadoOnboarding(entrada.medicoId) as EstadoAssistenteMedico | null;
    const estado = entrada.estadoAtual ?? estadoSalvo ?? { etapa: 'apresentacao' };
    let resposta: RespostaProcessamentoOnboarding;
    switch (estado.etapa) {
      case 'apresentacao': {
        const nome = texto.replace(/^(?:meu nome(?: completo)?\s*(?:é|e|:)|me chamo|sou(?: o| a)?)\s+/i, '')
          .trim().replace(/\s+/g, ' ');
        if (!nomeProfissionalValido(nome)) {
          resposta = await this.redigir({ etapa: 'apresentacao' }, 'pedir_nome', 'pedir_nome', {}, texto);
          break;
        }
        const registros = await this.ferramentas.buscarDadosMedicoOnline(nome, entrada.uf);
        const proximo: EstadoAssistenteMedico = { etapa: 'confirmacao_crm_rqe', nomeConfirmado: nome };
        if (registros?.crm) {
          Object.assign(proximo, { crmSugerido: registros.crm, rqeSugerido: registros.rqe,
            especialidadeSugerida: registros.especialidade, ufSugerida: registros.uf });
        }
        resposta = await this.redigir(proximo, registros?.crm ? 'confirmar_registros' : 'pedir_crm_uf',
          registros?.crm ? 'pedir_confirmacao' : 'pedir_crm', {}, texto);
        await this.ferramentas.salvarDadosMedico(entrada.medicoId, { nomeCompleto: nome });
        break;
      }
      case 'confirmacao_crm_rqe': {
        if (ehRespostaAfirmativa(texto)) {
          await this.ferramentas.salvarDadosMedico(entrada.medicoId, {
            crm: estado.crmSugerido, rqe: estado.rqeSugerido, especialidade: estado.especialidadeSugerida
          });
          const resumoPacientes = await this.ferramentas.obterResumoPacientes(entrada.medicoId);
          resposta = await this.redigir({ ...estado, etapa: 'aguardando_janela_tempo' },
            'informar_pacientes_e_pedir_periodo', 'dados_salvos', { resumoPacientes }, texto);
        } else {
          resposta = await this.redigir(estado, 'pedir_crm_uf', 'pedir_crm', {}, texto);
        }
        break;
      }
      case 'aguardando_janela_tempo': {
        const dataCorte = this.ferramentas.interpretarJanelaTempo(texto);
        resposta = await this.redigir({ ...estado, etapa: 'perguntar_preferencia_data', janelaDataCorte: dataCorte },
          'pedir_preferencia_data', 'conversa', { varreduraIniciada: false }, texto);
        resposta.acaoExecutada = `janela_configurada:${dataCorte}`;
        break;
      }
      case 'perguntar_preferencia_data': {
        const preferencia = /mesma|comprovante|pagamento|mesmo dia/i.test(texto)
          ? 'mesma_do_comprovante' : 'perguntar_uma_a_uma';
        await this.ferramentas.salvarPreferenciaDataConsulta(entrada.medicoId, preferencia);
        resposta = await this.redigir({ ...estado, etapa: 'concluido' }, 'confirmar_preferencia',
          'dados_salvos', { preferencia, preferenciaSalva: true, varreduraIniciada: false }, texto);
        resposta.acaoExecutada = `preferencia_salva:${preferencia}`;
        break;
      }
      default:
        return { novoEstado: estado, mensagensEnviar: [] };
    }
    await this.ferramentas.salvarEstadoOnboarding(entrada.medicoId, resposta.novoEstado);
    return resposta;
  }

  private async redigir(estado: EstadoAssistenteMedico, objetivo: Objetivo, evento: EventoComunicacaoNoto,
    dados: Record<string, unknown> = {}, mensagemRecebida: string | null = null): Promise<RespostaProcessamentoOnboarding> {
    const mensagensEnviar = await this.gerador.gerar({ evento, destinatario: 'medico',
      medico: { nome: nomeProfissionalValido(estado.nomeConfirmado) ? estado.nomeConfirmado! : null,
        crm: estado.crmSugerido ?? null, rqe: estado.rqeSugerido ?? null },
      caso: null, quantidadeNotasParadas: 0, mensagemRecebida, historico: [],
      dados: { fluxo: 'onboarding_assistente', objetivo, etapa: estado.etapa,
        registrosSugeridos: { crm: estado.crmSugerido ?? null, uf: estado.ufSugerida ?? null,
          rqe: estado.rqeSugerido ?? null, especialidade: estado.especialidadeSugerida ?? null },
        janelaDataCorte: estado.janelaDataCorte ?? null, ...dados }
    });
    return { novoEstado: estado, mensagensEnviar };
  }
}
