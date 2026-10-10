/** Compatibilidade com chamadas antigas: treino não é mais enviado. */
import type pg from 'pg';
import type { AppConfig } from '../../config.js';
export function criarDisparadorTreino(_pool: pg.Pool, _config: AppConfig) {
  return (_medicoId: string): void => {};
}
