import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  const sql = await readFile(new URL('./migrations/20261014-casos-agente.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.info('Migração aditiva de casos concluída.');
} finally { await pool.end(); }
