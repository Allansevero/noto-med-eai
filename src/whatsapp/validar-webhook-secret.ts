/**
 * Validação de autenticidade do webhook da Evolution API em tempo constante.
 * O segredo configurado é sempre injetado pelo chamador para manter o módulo
 * puro e testável sem depender de process.env ou frameworks HTTP específicos.
 */

import { timingSafeEqual } from 'node:crypto';

export function validarWebhookSecret(
  tokenRecebido: string | undefined | null,
  segredoConfigurado: string
): boolean {
  if (!tokenRecebido || !segredoConfigurado) {
    return false;
  }

  const bufRecebido = Buffer.from(tokenRecebido);
  const bufConfigurado = Buffer.from(segredoConfigurado);

  if (bufRecebido.length !== bufConfigurado.length) {
    return false;
  }

  return timingSafeEqual(bufRecebido, bufConfigurado);
}
