/**
 * Script de migração para remover tabelas legadas/abandonadas que não fazem parte
 * do escopo de funcionamento do Noto (secretarias, contadores, agenda_slots,
 * consentimentos legados, turnos de bot assistente desativado, etc).
 */
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

const tabelasParaRemover = [
  'secretaria_medico',
  'secretarias',
  'contador_medico',
  'contadores',
  'agenda_slots',
  'solicitacao_nota_agendamentos',
  'consentimentos',
  'onboarding_treinos_whatsapp',
  'dados_profissionais_pendencias',
  'dados_profissionais_mensagens',
  'emissoes_pendentes_confirmacoes',
  'noto_comunicacoes',
  'noto_assistente_turnos',
  'pagamentos'
];

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Conectando ao PostgreSQL do Supabase...');
  await client.connect();
  console.log('Conexão estabelecida com sucesso!');

  for (const tabela of tabelasParaRemover) {
    console.log(`Removendo tabela (se existir): ${tabela}...`);
    await client.query(`DROP TABLE IF EXISTS public.${tabela} CASCADE;`);
  }

  console.log('\nRemoção concluída com sucesso!');

  const res = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    ORDER BY table_name;
  `);

  console.log(`\nTabelas ativas no schema public (${res.rows.length}):`);
  for (const row of res.rows) {
    console.log(` - ${row.table_name}`);
  }

  await client.end();
}

main().catch(err => {
  console.error('Falha ao remover tabelas:', err);
  process.exit(1);
});
