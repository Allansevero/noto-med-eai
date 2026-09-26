/**
 * Regras puras de retentativa, cálculo de backoff exponencial e expiração de lock.
 * Não lê process.env nem relógio de sistema sem injeção, viabilizando testes
 * temporais exatos e sem flakiness (seção 3.2, item 5 do plano).
 */

import {
  MAX_TENTATIVAS_EMISSAO,
  INTERVALO_BASE_BACKOFF_SEGUNDOS,
  TIMEOUT_LOCK_WORKER_MINUTOS
} from './worker-config.js';

export function excedeuTentativasEmissao(
  tentativas: number,
  maxTentativas: number = MAX_TENTATIVAS_EMISSAO
): boolean {
  return tentativas >= maxTentativas;
}

export function calcularProximaTentativa(
  tentativas: number,
  agora: Date = new Date()
): Date {
  const fatorExponencial = 2 ** Math.max(0, tentativas - 1);
  const segundosEspera = INTERVALO_BASE_BACKOFF_SEGUNDOS * fatorExponencial;
  return new Date(agora.getTime() + segundosEspera * 1000);
}

export function lockWorkerExpirado(
  bloqueadaEm?: Date | null,
  agora: Date = new Date(),
  timeoutMinutos: number = TIMEOUT_LOCK_WORKER_MINUTOS
): boolean {
  if (!bloqueadaEm) return true;
  const diferencaMs = agora.getTime() - bloqueadaEm.getTime();
  const timeoutMs = timeoutMinutos * 60 * 1000;
  return diferencaMs >= timeoutMs;
}
