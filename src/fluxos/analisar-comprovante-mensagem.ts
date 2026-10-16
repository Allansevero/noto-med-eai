/** Extract financial evidence from actual media bytes, including outgoing NFS-e. */
import type { PaligemmaComprovanteClient, DadosComprovanteExtraidos } from '../io/nvidia/paligemma-comprovante-client.js';
import type { EvolutionApiClient } from '../io/evolution/evolution-api-client.js';
import { prepararMidiaFiscal } from '../agente-fiscal/io/preparar-midia-fiscal.js';

export interface AnalisarComprovanteDeps {
  comprovanteClient?: PaligemmaComprovanteClient;
  evolutionClient?: EvolutionApiClient;
}

export async function tentarAnalisarComprovanteMensagem(
  instanciaNome: string,
  mensagemId: string,
  tipo: string,
  _fromMe: boolean,
  payloadData: any,
  deps: AnalisarComprovanteDeps
): Promise<DadosComprovanteExtraidos | null> {
  if ((tipo !== 'imagem' && tipo !== 'documento') || !deps.comprovanteClient) return null;
  try {
    const dados = payloadData?.data ?? payloadData;
    let base64 = dados?.message?.imageMessage?.base64 ?? dados?.message?.documentMessage?.base64 ?? dados?.base64;
    // The webhook passes the WhatsApp key, never a database message UUID.
    const whatsappId = dados?.key?.id ?? mensagemId;
    if (!base64 && deps.evolutionClient && whatsappId) {
      base64 = (await deps.evolutionClient.obterBase64MensagemMidia(instanciaNome, whatsappId))?.base64;
    }
    if (typeof base64 !== 'string' || !base64) return null;
    const midia = await prepararMidiaFiscal(base64);
    return {
      ...await deps.comprovanteClient.analisarImagem(midia.base64, midia.mimeType),
      documentoHash: midia.documentoHash
    };
  } catch {
    // No fabricated negative: the durable locator will retry or mark manual review.
    return null;
  }
}
