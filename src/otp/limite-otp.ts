/**
 * Regras puras de expiração, contagem de tentativas e cooldown de OTP.
 * Não lê relógio de sistema nem variáveis de ambiente diretamente se
 * fornecidos por parâmetro, permitindo testes determinísticos no tempo.
 */

import {
  TTL_OTP_MINUTOS,
  LIMITE_TENTATIVAS_OTP,
  COOLDOWN_REENVIO_SEGUNDOS
} from './otp-config.js';

export function otpEstaExpirado(expiraEm: Date, agora: Date = new Date()): boolean {
  return agora.getTime() > expiraEm.getTime();
}

export function excedeuTentativasOtp(
  tentativas: number,
  limite: number = LIMITE_TENTATIVAS_OTP
): boolean {
  return tentativas >= limite;
}

export function estaEmCooldownReenvio(
  criadoEm: Date,
  cooldownSegundos: number = COOLDOWN_REENVIO_SEGUNDOS,
  agora: Date = new Date()
): boolean {
  const milissegundosPassados = agora.getTime() - criadoEm.getTime();
  const milissegundosCooldown = cooldownSegundos * 1000;
  return milissegundosPassados < milissegundosCooldown;
}

export function calcularDataExpiracao(
  minutos: number = TTL_OTP_MINUTOS,
  agora: Date = new Date()
): Date {
  return new Date(agora.getTime() + minutos * 60 * 1000);
}
