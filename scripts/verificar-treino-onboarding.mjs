/** Verifica configuração e persistência sem enviar mensagens de WhatsApp. */
import 'dotenv/config';
import pg from 'pg';
for (const nome of ['DATABASE_URL', 'EVOLUTION_API_URL', 'EVOLUTION_GLOBAL_API_KEY']) {
  if (!process.env[nome]) throw new Error(`${nome} não configurada`);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  const { rows } = await pool.query(`select estado, count(*)::integer as quantidade
    from onboarding_treinos_whatsapp group by estado order by estado`);
  console.log(`Treino: ${process.env.TREINO_ONBOARDING_ATIVO === 'true' ? 'ativado' : 'desativado'}. Tabela acessível.`);
  console.log('Estados dos treinos:', rows);
  console.log('Nenhuma mensagem enviada. Este teste não confirma conexão com Evolution nem entrega no WhatsApp.');
} finally { await pool.end(); }
