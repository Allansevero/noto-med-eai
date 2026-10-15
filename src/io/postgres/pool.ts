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

  const novoPool = new Pool({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    keepAlive: true,
    statement_timeout: 60_000
  });

  // Conexão ociosa derrubada pelo servidor emite 'error'; sem listener o Node encerra o processo.
  novoPool.on('error', (erro) => {
    console.error('[Postgres] Conexão ociosa do pool falhou; o pool abrirá outra sob demanda:', erro.message);
  });
  return novoPool;
}

export const pool = criarPoolPostgres();
