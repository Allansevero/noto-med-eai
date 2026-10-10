/**
 * Formata a causa de recusa ou erro de emissão para notificação e diagnóstico.
 * Prioriza pendências fiscais estruturadas e códigos da SEFIN antes de usar a
 * mensagem genérica, garantindo que o médico e o Noto saibam o motivo exato.
 */
import type { FalhaEmissao } from '../agente-fiscal/investigacao.js';

export function formatarMotivoFalhaEmissao(falha: FalhaEmissao): string {
  if (falha.pendenciasFiscais && falha.pendenciasFiscais.length > 0) {
    const detalhes = falha.pendenciasFiscais
      .map(p => `${p.campo} (${p.codigo}): ${p.mensagem}`)
      .join('; ');
    return `${falha.erro} Detalhes: ${detalhes}`;
  }
  if (falha.codigoErroSefin) {
    return `Rejeição SEFIN ${falha.codigoErroSefin}: ${falha.erro}`;
  }
  return falha.erro;
}
