/**
 * Orquestrador central do webhook da Evolution API.
 * Valida autenticidade e payload, extrai contato e direciona para:
 * 1. Resposta de CPF do paciente (se aguardando_cpf_desde).
 * 2. Casamento de respostas rápidas do médico (/agendado ou /emissao).
 * 3. Descarte seguro de mensagens de grupo e comuns (seções 2 e 3 do plano).
 */

import type { DadosProfissionaisService } from '../conta/dados-profissionais-service.js';
import { validarWebhookSecret } from '../whatsapp/validar-webhook-secret.js';
import { conexaoWebhookSchema } from '../whatsapp/payload-conexao-webhook-schema.js';
import { extrairTelefoneJid } from '../whatsapp/extrair-telefone-jid.js';
import {
  webhookEvolutionSchema,
  extrairTextoMensagem,
  type WebhookEvolutionPayload
} from '../whatsapp/payload-webhook-schema.js';
import { casarRespostaRapida } from '../whatsapp/casar-resposta-rapida.js';
import { extrairCpfTexto } from '../paciente/extrair-cpf-texto.js';
import { processarRespostaCpf } from './processar-resposta-cpf.js';
import { processarRespostaDataConsulta } from './processar-resposta-data-consulta.js';
import { processarComandoAgendado } from './processar-comando-agendado.js';
import { processarComandoEmissao } from './processar-comando-emissao.js';
import type { AtendimentoRepositorio } from '../atendimento/atendimento-repositorio.js';
import type { EnviarMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';
import type { ConsultaCpfProvider } from '../paciente/consulta-cpf-provider.js';
import type { ExtratorIaService } from '../ia/extrator-ia-service.js';
import type { BillingRepositorio } from '../billing/billing-repositorio.js';
import {
  ehEventoHistorico,
  ehEventoSincronizacaoAuxiliar
} from '../whatsapp/payload-historico-webhook-schema.js';
import { processarHistoricoWebhook } from './processar-historico-webhook.js';

export interface ProcessarWebhookDeps {
  repositorio: AtendimentoRepositorio;
  dadosProfissionais?: DadosProfissionaisService;
  enviarMensagemPaciente: EnviarMensagemPaciente;
  billingRepositorio?: BillingRepositorio;
  consultaCpfProvider?: ConsultaCpfProvider;
  iaService?: ExtratorIaService;
  segredoConfigurado: string;
  pepper: string;
  instanciaOficialNome?: string;
  aoAtualizarConexao?: (evento: { instancia: string; state: 'open' | 'close' | 'connecting' }) => Promise<void>;
}

export type ResultadoProcessarWebhook =
  | {
      ok: true;
      acao: 'resposta_perfil_medico' | 'resposta_cpf' | 'resposta_data_consulta' | 'comando_agendado' | 'comando_emissao' | 'historico_sincronizado' | 'conexao_atualizada' | 'descartada';
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

  const conexao = conexaoWebhookSchema.safeParse(payloadBruto);
  if (conexao.success) {
    if (!deps.segredoConfigurado) return { ok: false, motivo: 'autenticacao_invalida' };
    if (!deps.aoAtualizarConexao) return { ok: true, acao: 'descartada' };
    await deps.aoAtualizarConexao({ instancia: conexao.data.instance, state: conexao.data.data.state });
    return { ok: true, acao: 'conexao_atualizada' };
  }

  if (ehEventoHistorico(payloadBruto)) {
    const resultado = await processarHistoricoWebhook(payloadBruto, deps);
    if (!resultado.ok) return resultado;
    return { ok: true, acao: resultado.acao, detalhe: resultado };
  }
  if (ehEventoSincronizacaoAuxiliar(payloadBruto)) {
    return { ok: true, acao: 'descartada' };
  }

  const parsed = webhookEvolutionSchema.safeParse(payloadBruto);
  if (!parsed.success) return { ok: false, motivo: 'payload_invalido' };

  const payload = parsed.data;
  const jidPrincipal = payload.data.key.remoteJid;
  const jidAlternativo = payload.data.key.remoteJidAlt;
  const telefone =
    extrairTelefoneJid(jidAlternativo) ||
    extrairTelefoneJid(jidPrincipal);
  const texto = extrairTextoMensagem(payload.data);
  if (!telefone || !texto) return { ok: true, acao: 'descartada' };

  const instancia = await deps.repositorio.buscarInstanciaPorNome(payload.instance);
  if (!instancia) return { ok: false, motivo: 'instancia_nao_encontrada' };

  // O modelo enviado pelo Noto Oficial ensina o comando; não é uma emissão.
  if (payload.data.key.fromMe && (instancia.oficial || payload.instance === (deps.instanciaOficialNome || 'notomed_oficial'))) {
    return { ok: true, acao: 'descartada' };
  }

  const medico = await deps.repositorio.buscarMedicoPorTelefone(telefone);
  if (!payload.data.key.fromMe && medico && deps.dadosProfissionais && deps.segredoConfigurado &&
      (instancia.oficial || payload.instance === (deps.instanciaOficialNome || 'notomed_oficial'))) {
    const resposta = await deps.dadosProfissionais.processarResposta({
      medicoId: medico.id, texto, mensagemId: payload.data.key.id,
      mensagemEm: payload.data.messageTimestamp === undefined ? undefined
        : new Date(Number(payload.data.messageTimestamp) * (Number(payload.data.messageTimestamp) < 1e12 ? 1000 : 1))
    });
    if (resposta.tratada) return { ok: true, acao: 'resposta_perfil_medico', detalhe: resposta };
  }
  const medicoId = instancia.medicoId || medico?.id || null;

  const conversa = await deps.repositorio.buscarOuCriarConversa(instancia.id, medicoId, telefone);
  if (conversa.medicoId) {
    const paciente = await deps.repositorio.criarPacienteMinimo({
      medicoId: conversa.medicoId,
      telefone,
      nome: null, // Nunca salvar o nome do paciente pelo nome/pushName do WhatsApp
      origemCadastro: 'conversa_whatsapp'
    });
    if (conversa.pacienteId !== paciente.id) {
      await deps.repositorio.vincularPacienteConversa(conversa.id, paciente.id);
      conversa.pacienteId = paciente.id;
    }
  }
  if (deps.repositorio.salvarMensagem) {
    await deps.repositorio.salvarMensagem({
      conversaId: conversa.id,
      direcao: payload.data.key.fromMe ? 'enviada' : 'recebida',
      tipoMensagem: 'texto',
      conteudo: texto,
      payloadBruto: payload.data
    });
  }
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

  // 1. Resposta ao pedido de CPF (paciente ou médico fornecendo no chat)
  const temCpfTexto = extrairCpfTexto(texto);
  if (conversa.aguardandoCpfDesde || temCpfTexto) {
    const res = await processarRespostaCpf(conversa, texto, {
      repositorio: deps.repositorio,
      consultaCpfProvider: deps.consultaCpfProvider,
      pepper: deps.pepper
    });
    if (res.ok) {
      return { ok: true, acao: 'resposta_cpf', detalhe: res };
    }
  }

  // 2. Resposta do médico à pergunta sobre a data da consulta
  const medico = await deps.repositorio.buscarMedicoPorTelefone(telefone);
  if (medico) {
    const solicitacaoPendente = await deps.repositorio.buscarSolicitacaoAguardandoData(medico.id);
    if (solicitacaoPendente) {
      const resData = await processarRespostaDataConsulta(telefone, texto, {
        repositorio: deps.repositorio,
        dadosProfissionais: deps.dadosProfissionais,
        enviarMensagem: deps.enviarMensagemPaciente,
        instanciaOficialNome: deps.instanciaOficialNome || 'notomed_oficial'
      });
      if (resData.ok) {
        return { ok: true, acao: 'resposta_data_consulta', detalhe: resData };
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
    dadosProfissionais: deps.dadosProfissionais,
    enviarMensagemPaciente: deps.enviarMensagemPaciente,
    billingRepositorio: deps.billingRepositorio,
    consultaCpfProvider: deps.consultaCpfProvider,
    iaService: deps.iaService,
    pepper: deps.pepper,
    instanciaNome: payload.instance,
    instanciaOficialNome: deps.instanciaOficialNome || 'notomed_oficial',
    textoComando: texto,
    datasComando: casamento.datas
  });
  return { ok: true, acao: 'comando_emissao', detalhe: res };
}
