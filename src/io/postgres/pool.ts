/**
 * Pool de conexões PostgreSQL para acesso direto ao banco do Supabase.
 * Configura parâmetros de conexão, timeout e SSL quando necessário
 * para comunicação segura com a VPS na Hostinger.
 */

import pg from 'pg';
import { config } from '../../config.js';

const { Pool } = pg;

export function criarPoolPostgres(connectionString: string = config.databaseUrl): pg.Pool {
  const isLocal = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');

  return new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });
}

export const pool = criarPoolPostgres();
