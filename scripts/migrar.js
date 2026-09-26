/**
 * Script de migração para aplicar schema_nf_saude.sql diretamente no PostgreSQL.
 * Lê a string de conexão do .env ou parâmetro de linha de comando.
 */
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.gvriqdvahxhsqjtqkcqk:XwQcWvFJKHu8P1gr@aws-0-sa-east-1.pooler.supabase.com:5432/postgres';

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Conectando ao PostgreSQL do Supabase...');
  await client.connect();
  console.log('Conexão autenticada estabelecida!');

  const schemaPath = path.resolve('schema_nf_saude.sql');
  let sql = fs.readFileSync(schemaPath, 'utf8');

  // Ajustes de compatibilidade do Supabase Cloud:
  // pgsodium no Supabase Cloud é administrado internamente pelo supabase_vault
  sql = sql.replace(/create extension if not exists "pgsodium";/gi, '-- pgsodium gerenciado pelo Supabase');

  console.log('Executando DDL completo de schema_nf_saude.sql...');
  await client.query(sql);
  console.log('Migração executada com sucesso!');

  const tablesRes = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log('\nTabelas ativas no schema public:');
  for (const row of tablesRes.rows) {
    console.log(` - ${row.table_name}`);
  }

  await client.end();
}

main().catch(err => {
  console.error('Falha ao aplicar migração:', err);
  process.exit(1);
});
