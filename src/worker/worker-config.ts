/**
 * Constantes de negócio para o processamento assíncrono da fila de emissão de NFS-e.
 * Define limites de tentativas, política de backoff e timeouts de bloqueio
 * sem dependência de variáveis de ambiente (conforme seções 1 e 3.2 do plano).
 */

export const MAX_TENTATIVAS_EMISSAO = 3;
export const INTERVALO_BASE_BACKOFF_SEGUNDOS = 60;
export const TIMEOUT_LOCK_WORKER_MINUTOS = 5;
export const INTERVALO_RATE_LIMIT_SEGUNDOS = 10;
