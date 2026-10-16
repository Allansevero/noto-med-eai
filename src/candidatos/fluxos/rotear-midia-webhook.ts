/**
 * Roteamento e obtenção de mídia recebida do paciente no webhook do WhatsApp.
 * Obtém o base64 da mídia (direto do payload ou via Evolution API) e aciona
 * o pipeline de candidatos a emissão com Gemini.
 */

import { processarMidiaComprovante, type ResultadoProcessarMidia } from './processar-midia-comprovante.js';
import type { GeminiComprovanteClient } from '../io/gemini-comprovante-client.js';
import type { CandidatosRepositorio } from '../io/candidatos-repositorio.js';
import type { EvolutionApiClient } from '../../io/evolution/evolution-api-client.js';

export interface RotearMidiaWebhookParams {
  instanciaNome: string;
  medicoId: string;
  conversaId: string;
  mensagemId: string;
  telefonePaciente: string;
  tipo: string;
  fromMe: boolean;
  payloadData: any;
}

export interface RotearMidiaWebhookDeps {
  geminiClient: GeminiComprovanteClient;
  repositorio: CandidatosRepositorio;
  evolutionClient?: EvolutionApiClient;
  enviarMensagemAoMedico?: (telefone: string, texto: string) => Promise<boolean>;
}

export async function rotearMidiaWebhook(
  params: RotearMidiaWebhookParams,
  deps: RotearMidiaWebhookDeps
): Promise<ResultadoProcessarMidia | null> {
  // Ignora mensagens enviadas pelo próprio consultório ou que não sejam mídia
  if (params.fromMe || (params.tipo !== 'imagem' && params.tipo !== 'documento')) {
    return null;
  }

  // 1. Tenta extrair o base64 já embutido no payload
  let base64 = params.payloadData?.message?.imageMessage?.base64
    || params.payloadData?.message?.documentMessage?.base64
    || params.payloadData?.base64;

  let mimeType = params.payloadData?.message?.imageMessage?.mimetype
    || params.payloadData?.message?.documentMessage?.mimetype
    || (params.tipo === 'documento' ? 'application/pdf' : 'image/jpeg');

  // 2. Se a Evolution não enviou inline, busca da API
  if (!base64 && deps.evolutionClient) {
    try {
      const midia = await deps.evolutionClient.obterBase64MensagemMidia(params.instanciaNome, params.mensagemId);
      base64 = midia?.base64;
      if (midia?.mimetype) mimeType = midia.mimetype;
    } catch (err: any) {
      console.warn('[rotearMidiaWebhook] Falha ao obter base64 da mídia na Evolution:', err?.message || err);
    }
  }

  if (!base64) return null;

  return processarMidiaComprovante(
    {
      medicoId: params.medicoId,
      conversaId: params.conversaId,
      mensagemId: params.mensagemId,
      telefonePaciente: params.telefonePaciente,
      base64,
      mimeType
    },
    {
      geminiClient: deps.geminiClient,
      repositorio: deps.repositorio,
      enviarMensagemAoMedico: deps.enviarMensagemAoMedico
    }
  );
}
