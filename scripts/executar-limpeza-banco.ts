import dotenv from 'dotenv';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const sqlPath = path.join(__dirname, 'limpar-banco-completo.sql');
  const sql = fs.readFileSync(sqlPath, 'utf-8');

  console.log('Conectando ao banco de dados...');
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('Executando limpeza completa do banco de dados...');
    await pool.query(sql);
    console.log('Tabelas e auth.users completamente limpos!');

    if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Limpando buckets do Supabase Storage via Storage API...');
      const { createClient } = await import('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      for (const bucket of ['certificados', 'xmls_referencia', 'notas']) {
        try {
          const { data: files } = await supabase.storage.from(bucket).list('', { limit: 1000 });
          if (files && files.length > 0) {
            const paths = files.map(f => f.name);
            await supabase.storage.from(bucket).remove(paths);
            console.log(`Bucket '${bucket}' limpo (${paths.length} arquivos removidos).`);
          }
        } catch (e: any) {
          console.warn(`Aviso ao limpar bucket '${bucket}':`, e?.message || e);
        }
      }
    }
    console.log('Banco de dados completamente resetado com sucesso!');
  } catch (err) {
    console.error('Erro ao executar limpeza:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
