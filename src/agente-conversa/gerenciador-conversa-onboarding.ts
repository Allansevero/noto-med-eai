/** O código controla as etapas; a NVIDIA redige com o guia noto-conversa.md. */
import type { FerramentasAssistenteNoto } from './ferramentas-assistente-noto.js';
import type { EventoComunicacaoNoto, GeradorMensagemNoto } from '../conversa/comunicador-noto.js';
import { nomeProfissionalValido, normalizarCrm } from '../conta/validar-dados-emissao.js';

export type EtapaOnboardingAssistente =
  | 'apresentacao' | 'aguardando_crm' | 'aguardando_rqe_opcional' | 'confirmacao_crm_rqe' | 'apresentar_pacientes_e_perguntar_janela'
  | 'aguardando_janela_tempo' | 'perguntar_preferencia_data' | 'concluido';

export interface EstadoAssistenteMedico {
  etapa: EtapaOnboardingAssistente;
  nomeConfirmado?: string;
  crmInformado?: string;
  rqeInformado?: string | null;
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

type Objetivo = 'apresentar_e_pedir_nome' | 'pedir_nome' | 'pedir_crm_uf' | 'oferecer_rqe_opcional'
  | 'informar_pacientes_e_pedir_periodo' | 'pedir_preferencia_data' | 'confirmar_preferencia';

function recusouRqe(texto: string): boolean {
  const t = texto.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/[.!?]+$/, '');
  return /^(?:nao(?: tenho| quero)?(?: rqe)?|sem(?: rqe)?|pular|dispenso|prefiro nao informar)(?:,? obrigado(?:a)?)?$/.test(t);
}
function interpretarCrm(texto: string): { crm: string; rqe?: string | null } | null {
  const m = texto.trim().match(/^(?:(?:meu\s+)?crm(?:\s+(?:é|e))?\s*:?\s*)?(\d{1,12})(?:\s*[\/-]?\s*([a-z]{2}))?(?:\s*(?:[,;]|e)?\s*(?:RQE\s*:?\s*(\d{1,12})|(sem\s+RQE|n[aã]o\s+(?:tenho|quero)\s+RQE)))?$/i);
  if (!m) return null;
  const crm = normalizarCrm(m[1] + (m[2] ? '/' + m[2] : ''));
  if (!crm || (m[3] && !/[1-9]/.test(m[3]))) return null;
  return { crm, ...(m[3] ? { rqe: m[3] } : m[4] ? { rqe: null } : {}) };
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
        const proximo: EstadoAssistenteMedico = { etapa: 'aguardando_crm', nomeConfirmado: nome };
        resposta = await this.redigir(proximo, 'pedir_crm_uf', 'pedir_crm', {}, texto);
        await this.ferramentas.salvarDadosMedico(entrada.medicoId, { nomeCompleto: nome });
        break;
      }
      case 'confirmacao_crm_rqe': // Conversas antigas passam a pedir o dado, sem adotar sugestões.
      case 'aguardando_crm': {
        const registro = interpretarCrm(texto);
        const proximo: EstadoAssistenteMedico = { ...estado, etapa: 'aguardando_crm' };
        if (!registro) {
          resposta = await this.redigir(proximo, 'pedir_crm_uf', 'pedir_crm', {}, texto);
          break;
        }
        await this.ferramentas.salvarDadosMedico(entrada.medicoId, registro);
        proximo.crmInformado = registro.crm;
        if (registro.rqe !== undefined) {
          proximo.rqeInformado = registro.rqe;
          resposta = await this.avancarParaPeriodo(entrada.medicoId, proximo, texto);
        } else {
          proximo.etapa = 'aguardando_rqe_opcional';
          resposta = await this.redigir(proximo, 'oferecer_rqe_opcional', 'conversa', {}, texto);
        }
        break;
      }
      case 'aguardando_rqe_opcional': {
        const rqe = texto.replace(/^(?:meu\s+)?RQE(?:\s+(?:é|e))?\s*:?\s*/i, '').trim();
        const omitido = recusouRqe(texto);
        if (!omitido && (!/^\d{1,12}$/.test(rqe) || !/[1-9]/.test(rqe))) {
          resposta = await this.redigir(estado, 'oferecer_rqe_opcional', 'conversa', { respostaRqeInvalida: true }, texto);
          break;
        }
        const rqeInformado = omitido ? null : rqe;
        await this.ferramentas.salvarDadosMedico(entrada.medicoId, { rqe: rqeInformado });
        resposta = await this.avancarParaPeriodo(entrada.medicoId, { ...estado, rqeInformado }, texto);
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

  private async avancarParaPeriodo(medicoId: string, estado: EstadoAssistenteMedico,
    texto: string): Promise<RespostaProcessamentoOnboarding> {
    const resumoPacientes = await this.ferramentas.obterResumoPacientes(medicoId);
    return this.redigir({ ...estado, etapa: 'aguardando_janela_tempo' },
      'informar_pacientes_e_pedir_periodo', 'dados_salvos', { resumoPacientes }, texto);
  }

  private async redigir(estado: EstadoAssistenteMedico, objetivo: Objetivo, evento: EventoComunicacaoNoto,
    dados: Record<string, unknown> = {}, mensagemRecebida: string | null = null): Promise<RespostaProcessamentoOnboarding> {
    const mensagensEnviar = await this.gerador.gerar({ evento, destinatario: 'medico',
      medico: { nome: nomeProfissionalValido(estado.nomeConfirmado) ? estado.nomeConfirmado! : null,
        crm: estado.crmInformado ?? null, rqe: estado.rqeInformado ?? null },
      caso: null, quantidadeNotasParadas: 0, mensagemRecebida, historico: [],
      dados: { fluxo: 'onboarding_assistente', objetivo, etapa: estado.etapa, usoRegistro: 'descricao_da_nota',
        registrosInformados: { crm: estado.crmInformado ?? null, rqe: estado.rqeInformado ?? null },
        janelaDataCorte: estado.janelaDataCorte ?? null, ...dados }
    });
    return { novoEstado: estado, mensagensEnviar };
  }
}
