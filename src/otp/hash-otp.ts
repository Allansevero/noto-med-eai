/**
 * Hash e verificação do código OTP. Nunca guardar nem comparar o código em
 * texto puro — só o HMAC. `pepper` é sempre injetado pelo chamador, nunca
 * lido direto do ambiente aqui, pra este módulo continuar testável sem
 * process.env.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';

export function gerarHashOtp(codigo: string, pepper: string): string {
  return createHmac('sha256', pepper).update(codigo).digest('hex');
}

export function compararHashOtp(codigo: string, hashEsperado: string, pepper: string): boolean {
  const hashCalculado = gerarHashOtp(codigo, pepper);
  const bufCalculado = Buffer.from(hashCalculado, 'hex');
  const bufEsperado = Buffer.from(hashEsperado, 'hex');

  if (bufCalculado.length !== bufEsperado.length) {
    return false;
  }

  return timingSafeEqual(bufCalculado, bufEsperado);
}
