/**
 * Extrai mídia e analisa comprovante bancário recebido via Visão Computacional.
 * Isolado do webhook principal para manter baixo acoplamento e respeitar limites de linhas.
 */

import type { PaligemmaComprovanteClient, DadosComprovanteExtraidos } from '../io/nvidia/paligemma-comprovante-client.js';
import type { EvolutionApiClient } from '../io/evolution/evolution-api-client.js';

export interface AnalisarComprovanteDeps {
  comprovanteClient?: PaligemmaComprovanteClient;
  evolutionClient?: EvolutionApiClient;
}

export async function tentarAnalisarComprovanteMensagem(
  instanciaNome: string,
  mensagemId: string,
  tipo: string,
  fromMe: boolean,
  payloadData: any,
  deps: AnalisarComprovanteDeps
): Promise<DadosComprovanteExtraidos | null> {
  if (fromMe || (tipo !== 'imagem' && tipo !== 'documento') || !deps.comprovanteClient) {
    return null;
  }

  let b64 = payloadData?.message?.imageMessage?.base64 || payloadData?.base64;
  if (!b64 && deps.evolutionClient) {
    try {
      const midia = await deps.evolutionClient.obterBase64MensagemMidia(instanciaNome, mensagemId);
      b64 = midia?.base64;
    } catch (err) {
      console.warn('[tentarAnalisarComprovanteMensagem] Falha ao obter base64 da mídia:', err);
    }
  }

  if (!b64) return null;

  try {
    const comp = await deps.comprovanteClient.analisarImagem(b64);
    return comp;
  } catch (err) {
    console.warn('[tentarAnalisarComprovanteMensagem] Falha ao analisar comprovante via VLM:', err);
    return null;
  }
}
