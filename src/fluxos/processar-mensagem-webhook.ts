/**
 * Orquestrador central do webhook da Evolution API.
 * Valida autenticidade e payload, extrai contato e direciona para:
 * 1. Resposta de CPF do paciente (se aguardando_cpf_desde).
 * 2. Casamento de respostas rápidas do médico (/agendado ou /emissao).
 * 3. Descarte seguro de mensagens de grupo e comuns (seções 2 e 3 do plano).
 */

import { validarWebhookSecret } from '../whatsapp/validar-webhook-secret.js';
import { extrairTelefoneJid } from '../whatsapp/extrair-telefone-jid.js';
import {
  webhookEvolutionSchema,
  extrairTextoMensagem,
  type WebhookEvolutionPayload
} from '../whatsapp/payload-webhook-schema.js';
import { casarRespostaRapida } from '../whatsapp/casar-resposta-rapida.js';
import { processarRespostaCpf } from './processar-resposta-cpf.js';
import { processarRespostaDataConsulta } from './processar-resposta-data-consulta.js';
import { processarComandoAgendado } from './processar-comando-agendado.js';
import { processarComandoEmissao } from './processar-comando-emissao.js';
import type { AtendimentoRepositorio } from '../atendimento/atendimento-repositorio.js';
import type { EnviarMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';
import type { ConsultaCpfProvider } from '../paciente/consulta-cpf-provider.js';
import type { ExtratorIaService } from '../ia/extrator-ia-service.js';

export interface ProcessarWebhookDeps {
  repositorio: AtendimentoRepositorio;
  enviarMensagemPaciente: EnviarMensagemPaciente;
  consultaCpfProvider?: ConsultaCpfProvider;
  iaService?: ExtratorIaService;
  segredoConfigurado: string;
  pepper: string;
  instanciaOficialNome?: string;
}

export type ResultadoProcessarWebhook =
  | {
      ok: true;
      acao: 'resposta_cpf' | 'resposta_data_consulta' | 'comando_agendado' | 'comando_emissao' | 'descartada';
      detalhe?: any;
    }
  | { ok: false; motivo: 'autenticacao_invalida' | 'payload_invalido' | 'instancia_nao_encontrada' };

export async function processarMensagemWebhook(
  payloadBruto: unknown,
  tokenRecebido: string | undefined | null,
  deps: ProcessarWebhookDeps
): Promise<ResultadoProcessarWebhook> {
  if (deps.segredoConfigurado && !validarWebhookSecret(tokenRecebido, deps.segredoConfigurado)) {
    return { ok: false, motivo: 'autenticacao_invalida' };
  }

  const parsed = webhookEvolutionSchema.safeParse(payloadBruto);
  if (!parsed.success) return { ok: false, motivo: 'payload_invalido' };

  const payload = parsed.data;
  const jidPrincipal = payload.data.key.remoteJid;
  const jidAlternativo = payload.data.key.remoteJidAlt;
  const jidAlvo = (jidPrincipal.includes('@lid') && jidAlternativo) ? jidAlternativo : jidPrincipal;
  const telefone = extrairTelefoneJid(jidAlvo) || (jidAlternativo ? extrairTelefoneJid(jidAlternativo) : null);
  const texto = extrairTextoMensagem(payload.data);
  if (!telefone || !texto) return { ok: true, acao: 'descartada' };

  const instancia = await deps.repositorio.buscarInstanciaPorNome(payload.instance);
  if (!instancia) return { ok: false, motivo: 'instancia_nao_encontrada' };

  const conversa = await deps.repositorio.buscarOuCriarConversa(instancia.id, instancia.medicoId, telefone);
  return rotearMensagem(conversa, texto, payload, deps, telefone);
}

async function rotearMensagem(
  conversa: any,
  texto: string,
  payload: WebhookEvolutionPayload,
  deps: ProcessarWebhookDeps,
  telefone: string
): Promise<ResultadoProcessarWebhook> {
  const fromMe = payload.data.key.fromMe;

  // 1. Resposta do paciente ao pedido de CPF
  if (!fromMe && conversa.aguardandoCpfDesde) {
    const res = await processarRespostaCpf(conversa, texto, {
      repositorio: deps.repositorio,
      consultaCpfProvider: deps.consultaCpfProvider,
      pepper: deps.pepper
    });
    return { ok: true, acao: 'resposta_cpf', detalhe: res };
  }

  // 2. Resposta do médico à pergunta sobre a data da consulta
  if (!fromMe) {
    const medico = await deps.repositorio.buscarMedicoPorTelefone(telefone);
    if (medico) {
      const solicitacaoPendente = await deps.repositorio.buscarSolicitacaoAguardandoData(medico.id);
      if (solicitacaoPendente) {
        const resData = await processarRespostaDataConsulta(telefone, texto, {
          repositorio: deps.repositorio,
          enviarMensagem: deps.enviarMensagemPaciente,
          instanciaOficialNome: deps.instanciaOficialNome || 'notomed_oficial'
        });
        if (resData.ok) {
          return { ok: true, acao: 'resposta_data_consulta', detalhe: resData };
        }
      }
    }
  }

  // Se não for do médico, mensagens comuns do paciente não disparam comandos
  if (!fromMe) return { ok: true, acao: 'descartada' };

  // 3. Comandos rápidos do médico
  const modelos = await deps.repositorio.buscarRespostasRapidasMedico(conversa.medicoId);
  const casamento = casarRespostaRapida(texto, true, modelos);
  if (!casamento.casou) return { ok: true, acao: 'descartada' };

  if (casamento.tipo === 'agendado') {
    const res = await processarComandoAgendado(conversa, [texto], {
      repositorio: deps.repositorio,
      pepper: deps.pepper,
      iaService: deps.iaService
    });
    return { ok: true, acao: 'comando_agendado', detalhe: res };
  }

  const res = await processarComandoEmissao(conversa, casamento.valorDigitadoCentavos, {
    repositorio: deps.repositorio,
    enviarMensagemPaciente: deps.enviarMensagemPaciente,
    instanciaNome: payload.instance,
    instanciaOficialNome: deps.instanciaOficialNome || 'notomed_oficial'
  });
  return { ok: true, acao: 'comando_emissao', detalhe: res };
}
