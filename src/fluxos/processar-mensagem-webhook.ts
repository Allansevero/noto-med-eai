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

import type { GerenciadorConversaOnboarding } from '../agente-conversa/gerenciador-conversa-onboarding.js';

export interface ProcessarWebhookDeps {
  repositorio: AtendimentoRepositorio;
  comunicadorNoto?: ComunicadorNoto;
  dadosProfissionais?: DadosProfissionaisService;
  enviarMensagemPaciente: EnviarMensagemPaciente;
  billingRepositorio?: BillingRepositorio;
  consultaCpfProvider?: ConsultaCpfProvider;
  iaService?: ExtratorIaService;
  segredoConfigurado: string;
  pepper: string;
  instanciaOficialNome?: string;
  instanciaAssistenteNome?: string;
  enviarMensagemAssistente?: EnviarMensagemPaciente;
  processarConversaAssistente?: (entrada: import('../agente-conversa/postgres-assistente.js').EntradaTurno) => Promise<unknown>;
  gerenciadorAssistente?: GerenciadorConversaOnboarding;
  aoAtualizarConexao?: (evento: { instancia: string; state: 'open' | 'close' | 'connecting' }) => Promise<void>;
}

export type ResultadoProcessarWebhook =
  | {
      ok: true;
      acao: 'conversa_oficial' | 'conversa_assistente' | 'resposta_perfil_medico' | 'resposta_cpf' | 'resposta_data_consulta' | 'comando_agendado' | 'comando_emissao' | 'historico_sincronizado' | 'conexao_atualizada' | 'descartada';
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
  const texto = extrairTextoMensagem(payload.data);
  if (!telefone) return { ok: true, acao: 'descartada', motivoDescarte: 'contato_nao_identificado' };
  if (!texto) return { ok: true, acao: 'descartada', motivoDescarte: 'mensagem_sem_texto' };

  // Mensagem na instância do Noto Assistente (container dedicado da IA conversacional)
  if (deps.instanciaAssistenteNome && payload.instance === deps.instanciaAssistenteNome) {
    if (payload.data.key.fromMe) {
      return { ok: true, acao: 'descartada', motivoDescarte: 'mensagem_enviada_pelo_assistente' };
    }
    if(deps.processarConversaAssistente){
      if(!deps.segredoConfigurado)return {ok:false,motivo:'autenticacao_invalida'};
      const timestamp = payload.data.messageTimestamp === undefined ? null : Number(payload.data.messageTimestamp);
      if (texto.length > 2000 || (timestamp !== null && (!Number.isFinite(timestamp) || timestamp < Date.now()/1000-86400 || timestamp > Date.now()/1000+60))) {
        return { ok: true, acao: 'descartada', motivoDescarte: 'gatilho_nao_reconhecido' };
      }
    }
    const medico=deps.processarConversaAssistente&&deps.repositorio.buscarMedicoAssistentePorTelefone
      ?await deps.repositorio.buscarMedicoAssistentePorTelefone(telefone,payload.instance)
      :await deps.repositorio.buscarMedicoPorTelefone(telefone);
    if(medico&&deps.segredoConfigurado){
      if(!deps.processarConversaAssistente&&deps.dadosProfissionais){
        const resposta=await deps.dadosProfissionais.processarResposta({medicoId:medico.id,texto,mensagemId:payload.data.key.id});
        if(resposta.tratada)return {ok:true,acao:'resposta_perfil_medico',detalhe:resposta};
      }
      // Resposta explícita à data de uma nota, sem confundir perguntas ou período de onboarding.
      if(/^(?:consulta (?:de|em) )?\d{1,2}\/\d{1,2}\/\d{4}/i.test(texto.trim())&&!texto.includes('?')&&
        await deps.repositorio.buscarSolicitacaoAguardandoData(medico.id)){
        const resposta=await processarRespostaDataConsulta(telefone,texto,{repositorio:deps.repositorio,dadosProfissionais:deps.dadosProfissionais,
          enviarMensagem:deps.enviarMensagemPaciente,comunicadorNoto:deps.comunicadorNoto,instanciaOficialNome:deps.instanciaAssistenteNome,medicoIdentificado:medico,mensagemId:payload.data.key.id});
        if(resposta.ok)return {ok:true,acao:'resposta_data_consulta',detalhe:resposta};
        if(resposta.motivo==='resposta_ja_processada')return {ok:true,acao:'descartada',motivoDescarte:'mensagem_duplicada'};
      }
    }
    if (medico && deps.processarConversaAssistente) {
      if (!deps.segredoConfigurado) return { ok: false, motivo: 'autenticacao_invalida' };
      return { ok: true, acao: 'conversa_assistente', detalhe: await deps.processarConversaAssistente({
        medicoId: medico.id, instancia: payload.instance, mensagemId: payload.data.key.id, texto
      }) };
    }
    if (medico && deps.gerenciadorAssistente) {
      const resp = await deps.gerenciadorAssistente.processarMensagemMedico({
        medicoId: medico.id,
        textoRecebido: texto
      });
      let mensagensConfirmadas = 0;
      if (deps.enviarMensagemAssistente) {
        for (const msg of resp.mensagensEnviar) {
          const envio = await deps.enviarMensagemAssistente.enviarTexto({
            instanciaNome: deps.instanciaAssistenteNome,
            contatoTelefone: telefone,
            texto: msg
          });
          if (!envio.sucesso) {
            const statusHttp = /^HTTP (\d{3})\b/.exec(envio.erro || '')?.[1];
            console.warn('[Onboarding Assistente]', { etapa: 'resposta', estado: 'envio_nao_confirmado',
              mensagensConfirmadas, ...(statusHttp ? { statusHttp: Number(statusHttp) } : {}) });
            return { ok: true, acao: 'conversa_assistente', detalhe: { ...resp,
              envio: { sucesso: false, mensagensConfirmadas } } };
          }
          mensagensConfirmadas++;
        }
      }
      return { ok: true, acao: 'conversa_assistente', detalhe: { ...resp,
        envio: { sucesso: mensagensConfirmadas === resp.mensagensEnviar.length, mensagensConfirmadas } } };
    }
    return { ok: true, acao: 'descartada', motivoDescarte:'medico_nao_identificado' };
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

  // Se não for do médico, mensagens comuns do paciente não disparam comandos
  if (!fromMe) return { ok: true, acao: 'descartada', motivoDescarte: 'mensagem_recebida_do_paciente' };

  // 3. Comandos rápidos do médico
  const modelos = await deps.repositorio.buscarRespostasRapidasMedico(conversa.medicoId);
  const casamento = casarRespostaRapida(texto, true, modelos);
  if (!casamento.casou) return { ok: true, acao: 'descartada', motivoDescarte: 'gatilho_nao_reconhecido' };

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
    comunicadorNoto: deps.comunicadorNoto,
    billingRepositorio: deps.billingRepositorio,
    consultaCpfProvider: deps.consultaCpfProvider,
    iaService: deps.iaService,
    pepper: deps.pepper,
    instanciaNome: payload.instance,
    instanciaOficialNome: deps.instanciaAssistenteNome || 'notomed_assistente',
    textoComando: texto,
    mensagemIdComando: payload.data.key.id,
    datasComando: casamento.datas
  });
  return { ok: true, acao: 'comando_emissao', detalhe: res };
}
