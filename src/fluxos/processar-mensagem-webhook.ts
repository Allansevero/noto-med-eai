/**
 * Orquestrador central do webhook da Evolution API.
 * Valida autenticidade e payload, extrai contato e direciona para:
 * 1. Resposta de CPF do paciente (se aguardando_cpf_desde).
 * 2. Casamento de respostas rápidas do médico (/agendado ou /emissao).
 * 3. Descarte seguro de mensagens de grupo e comuns (seções 2 e 3 do plano).
 */

import { extrairDatasConsulta } from '../emissao/regras/extrair-datas-consulta.js';
import type { ComunicadorNoto } from '../conversa/comunicador-noto.js';
import type { DadosProfissionaisService } from '../conta/dados-profissionais-service.js';
import { validarWebhookSecret } from '../whatsapp/validar-webhook-secret.js';
import { conexaoWebhookSchema } from '../whatsapp/payload-conexao-webhook-schema.js';
import { extrairTelefoneJid } from '../whatsapp/extrair-telefone-jid.js';
import {
  webhookEvolutionSchema,
  extrairTextoMensagem,
  extrairTipoMensagem,
  type WebhookEvolutionPayload
} from '../whatsapp/payload-webhook-schema.js';
import { extrairCpfTexto } from '../paciente/extrair-cpf-texto.js';
import { ehMensagemAutomatica } from '../whatsapp/regras/eh-mensagem-automatica.js';
import { processarRespostaCpf } from './processar-resposta-cpf.js';
import { processarRespostaDataConsulta } from './processar-resposta-data-consulta.js';
import type { AtendimentoRepositorio } from '../atendimento/atendimento-repositorio.js';
import type { EnviarMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';
import type { ConsultaCpfProvider } from '../paciente/consulta-cpf-provider.js';
import type { ExtratorIaService } from '../ia/extrator-ia-service.js';
import {
  ehEventoHistorico,
  ehEventoSincronizacaoAuxiliar
} from '../whatsapp/payload-historico-webhook-schema.js';
import { processarHistoricoWebhook } from './processar-historico-webhook.js';

import type { PaligemmaComprovanteClient } from '../io/nvidia/paligemma-comprovante-client.js';
import type { EvolutionApiClient } from '../io/evolution/evolution-api-client.js';
import { tentarAnalisarComprovanteMensagem } from './analisar-comprovante-mensagem.js';

export interface ProcessarWebhookDeps {
  repositorio: AtendimentoRepositorio;
  comunicadorNoto?: ComunicadorNoto;
  dadosProfissionais?: DadosProfissionaisService;
  enviarMensagemPaciente: EnviarMensagemPaciente;
  consultaCpfProvider?: ConsultaCpfProvider;
  iaService?: ExtratorIaService;
  comprovanteClient?: PaligemmaComprovanteClient;
  evolutionClient?: EvolutionApiClient;
  segredoConfigurado: string;
  pepper: string;
  instanciaOficialNome?: string;
  instanciaAssistenteNome?: string;
  enviarMensagemAssistente?: EnviarMensagemPaciente;
  modoCadastro?: 'conversacional' | 'confirmacao';
  processarComandoFiscal?: (medicoId: string, texto: string, telefone: string) => Promise<{ tratado: boolean; detalhe?: any }>;
  aoAtualizarConexao?: (evento: { instancia: string; state: 'open' | 'close' | 'connecting' }) => Promise<void>;
}

export type ResultadoProcessarWebhook =
  | {
      ok: true;
      acao: 'conversa_oficial' | 'conversa_assistente' | 'resposta_perfil_medico' | 'resposta_cpf' | 'resposta_data_consulta' | 'historico_sincronizado' | 'conexao_atualizada' | 'comando_fiscal' | 'descartada';
      detalhe?: any;
      motivoDescarte?: 'sem_tratador_conexao' | 'sincronizacao_auxiliar' | 'contato_nao_identificado' | 'mensagem_sem_texto' | 'mensagem_enviada_pelo_oficial' | 'mensagem_enviada_pelo_assistente' | 'mensagem_recebida_do_paciente' | 'gatilho_nao_reconhecido' | 'canal_oficial_somente_otp' | 'historico_assistente_ignorado' | 'medico_nao_identificado' | 'mensagem_duplicada';
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

  const instanciaRecebida=payloadBruto&&typeof payloadBruto==='object'?(payloadBruto as Record<string,unknown>).instance:null;
  if(instanciaRecebida===(deps.instanciaOficialNome||'notomed_oficial'))return {ok:true,acao:'descartada',motivoDescarte:'canal_oficial_somente_otp'};
  if(instanciaRecebida===deps.instanciaAssistenteNome&&ehEventoHistorico(payloadBruto))return {ok:true,acao:'descartada',motivoDescarte:'historico_assistente_ignorado'};

  const conexao = conexaoWebhookSchema.safeParse(payloadBruto);
  if (conexao.success) {
    if (!deps.segredoConfigurado) return { ok: false, motivo: 'autenticacao_invalida' };
    if (!deps.aoAtualizarConexao) return { ok: true, acao: 'descartada', motivoDescarte: 'sem_tratador_conexao' };
    await deps.aoAtualizarConexao({ instancia: conexao.data.instance, state: conexao.data.data.state });
    return { ok: true, acao: 'conexao_atualizada' };
  }

  if (ehEventoHistorico(payloadBruto)) {
    const resultado = await processarHistoricoWebhook(payloadBruto, deps);
    if (!resultado.ok) return resultado;
    return { ok: true, acao: resultado.acao, detalhe: resultado };
  }
  if (ehEventoSincronizacaoAuxiliar(payloadBruto)) {
    return { ok: true, acao: 'descartada', motivoDescarte: 'sincronizacao_auxiliar' };
  }

  const parsed = webhookEvolutionSchema.safeParse(payloadBruto);
  if (!parsed.success) return { ok: false, motivo: 'payload_invalido' };

  const payload = parsed.data;
  const jidPrincipal = payload.data.key.remoteJid;
  if (jidPrincipal.endsWith('@g.us')) return { ok: true, acao: 'descartada', motivoDescarte: 'contato_nao_identificado' };
  const jidAlternativo = payload.data.key.remoteJidAlt;
  const telefone =
    extrairTelefoneJid(jidAlternativo) ||
    extrairTelefoneJid(jidPrincipal);
  const tipo = extrairTipoMensagem(payload.data);
  const texto = extrairTextoMensagem(payload.data) || '';
  if (!telefone) return { ok: true, acao: 'descartada', motivoDescarte: 'contato_nao_identificado' };
  if (!texto && tipo === 'texto') return { ok: true, acao: 'descartada', motivoDescarte: 'mensagem_sem_texto' };

  // Mensagem na instância do Noto Assistente (container dedicado da IA conversacional)
  if (deps.instanciaAssistenteNome && payload.instance === deps.instanciaAssistenteNome) {
    if (!texto) {
      return { ok: true, acao: 'descartada', motivoDescarte: 'mensagem_sem_texto' };
    }
    if (payload.data.key.fromMe) {
      return { ok: true, acao: 'descartada', motivoDescarte: 'mensagem_enviada_pelo_assistente' };
    }
    if (ehMensagemAutomatica(texto)) {
      return { ok: true, acao: 'descartada', motivoDescarte: 'gatilho_nao_reconhecido' };
    }
    const medico = deps.repositorio.buscarMedicoAssistentePorTelefone
      ? await deps.repositorio.buscarMedicoAssistentePorTelefone(telefone, payload.instance)
      : await deps.repositorio.buscarMedicoPorTelefone(telefone);
    if (!medico) {
      return { ok: true, acao: 'descartada', motivoDescarte: 'medico_nao_identificado' };
    }
    if (deps.segredoConfigurado) {
      if (deps.processarComandoFiscal) {
        const cmdFiscal = await deps.processarComandoFiscal(medico.id, texto, telefone);
        if (cmdFiscal.tratado) return { ok: true, acao: 'comando_fiscal', detalhe: cmdFiscal.detalhe };
      }
      if (deps.dadosProfissionais) {
        const resposta = await deps.dadosProfissionais.processarResposta({ medicoId: medico.id, texto, mensagemId: payload.data.key.id });
        if (resposta.tratada) return { ok: true, acao: 'resposta_perfil_medico', detalhe: resposta };
      }
      // Resposta explícita à data de uma nota, sem confundir perguntas ou período de onboarding.
      if (/^(?:consulta (?:de|em) )?\d{1,2}\/\d{1,2}\/\d{4}/i.test(texto.trim()) && !texto.includes('?') &&
        await deps.repositorio.buscarSolicitacaoAguardandoData(medico.id)) {
        const resposta = await processarRespostaDataConsulta(telefone, texto, {
          repositorio: deps.repositorio,
          dadosProfissionais: deps.dadosProfissionais,
          enviarMensagem: deps.enviarMensagemPaciente,
          comunicadorNoto: deps.comunicadorNoto,
          instanciaOficialNome: deps.instanciaAssistenteNome,
          medicoIdentificado: medico,
          mensagemId: payload.data.key.id
        });
        if (resposta.ok) return { ok: true, acao: 'resposta_data_consulta', detalhe: resposta };
        if (resposta.motivo === 'resposta_ja_processada') return { ok: true, acao: 'descartada', motivoDescarte: 'mensagem_duplicada' };
      }
    }
    return { ok: true, acao: 'descartada', motivoDescarte: 'gatilho_nao_reconhecido' };
  }

  const instancia = await deps.repositorio.buscarInstanciaPorNome(payload.instance);
  if (!instancia) return { ok: false, motivo: 'instancia_nao_encontrada' };

  if(instancia.oficial)return {ok:true,acao:'descartada',motivoDescarte:'canal_oficial_somente_otp'};
  const medico=await deps.repositorio.buscarMedicoPorTelefone(telefone);
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
  const comprovante = await tentarAnalisarComprovanteMensagem(
    payload.instance,
    payload.data.key.id,
    tipo,
    payload.data.key.fromMe,
    payload.data,
    { comprovanteClient: deps.comprovanteClient, evolutionClient: deps.evolutionClient }
  );
  if (comprovante) {
    (payload.data as any).comprovante = comprovante;
  }

  if (deps.repositorio.salvarMensagem) {
    await deps.repositorio.salvarMensagem({
      conversaId: conversa.id,
      direcao: payload.data.key.fromMe ? 'enviada' : 'recebida',
      tipoMensagem: tipo,
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
  if (medico && extrairDatasConsulta(texto, new Date()).datas.length > 0) {
    const solicitacaoPendente = await deps.repositorio.buscarSolicitacaoAguardandoData(medico.id);
    if (solicitacaoPendente) {
      const resData = await processarRespostaDataConsulta(telefone, texto, {
        repositorio: deps.repositorio,
        dadosProfissionais: deps.dadosProfissionais,
        enviarMensagem: deps.enviarMensagemPaciente,
        comunicadorNoto: deps.comunicadorNoto,
        instanciaOficialNome: deps.instanciaAssistenteNome || 'notomed_assistente'
      });
      if (resData.ok) {
        return { ok: true, acao: 'resposta_data_consulta', detalhe: resData };
      }
    }
  }

  if (!fromMe) return { ok: true, acao: 'descartada', motivoDescarte: 'mensagem_recebida_do_paciente' };

  return { ok: true, acao: 'descartada', motivoDescarte: 'gatilho_nao_reconhecido' };
}
