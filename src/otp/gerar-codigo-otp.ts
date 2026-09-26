/**
 * Geração criptograficamente segura de código numérico OTP. Separado do
 * hash e envio para ser reutilizável e facilmente testável sem dependências
 * externas de rede ou banco.
 */

import { randomInt } from 'node:crypto';
import { TAMANHO_CODIGO_OTP } from './otp-config.js';

export function gerarCodigoOtp(tamanho: number = TAMANHO_CODIGO_OTP): string {
  const min = 10 ** (tamanho - 1);
  const max = 10 ** tamanho;
  const numero = randomInt(min, max);
  return numero.toString();
}
