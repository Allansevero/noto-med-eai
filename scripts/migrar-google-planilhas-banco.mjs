import 'dotenv/config';
import pg from 'pg';
import { readFile } from 'node:fs/promises';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL não configurada no ambiente');
}

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000
});

const client = await pool.connect();
try {
  await client.query('begin');
  const sql = await readFile(new URL('./migrations/20261015-google-planilhas-banco-externo.sql', import.meta.url), 'utf8');
  await client.query(sql);
  await client.query('commit');
  console.log('[Migração] Colunas de banco externo adicionadas em google_planilhas_conexoes!');
} catch (erro) {
  await client.query('rollback');
  console.error('[Migração] Falha ao aplicar migração:', erro);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
