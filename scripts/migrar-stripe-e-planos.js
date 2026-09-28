/**
 * Migração para adicionar suporte ao Stripe Billing, campos na tabela assinaturas
 * e cadastrar os planos Gratuito (5 notas/dia) e Mensal (100 notas/mês, R$ 100).
 */
import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const connectionString = process.env.DATABASE_URL;

async function main() {
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
  });

  console.log('Conectando ao banco...');
  await client.connect();

  console.log('Adicionando colunas do Stripe em assinaturas...');
  await client.query(`
    ALTER TABLE assinaturas 
    ADD COLUMN IF NOT EXISTS stripe_customer_id text,
    ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

    CREATE INDEX IF NOT EXISTS idx_assinaturas_stripe_sub ON assinaturas(stripe_subscription_id);
    CREATE INDEX IF NOT EXISTS idx_assinaturas_stripe_cust ON assinaturas(stripe_customer_id);
  `);

  console.log('Cadastrando/Atualizando planos padrão (Gratuito e Mensal)...');
  await client.query(`
    INSERT INTO planos (nome, descricao, preco_mensal_centavos, limite_notas_mes, recursos, ativo)
    VALUES 
      ('Gratuito', '5 notas fiscais gratuitas por dia', 0, NULL, '{"limite_notas_dia": 5}'::jsonb, true)
    ON CONFLICT (nome) DO UPDATE SET
      descricao = EXCLUDED.descricao,
      preco_mensal_centavos = EXCLUDED.preco_mensal_centavos,
      limite_notas_mes = EXCLUDED.limite_notas_mes,
      recursos = EXCLUDED.recursos,
      ativo = true;

    INSERT INTO planos (nome, descricao, preco_mensal_centavos, limite_notas_mes, recursos, ativo)
    VALUES 
      ('Mensal', '100 notas fiscais por mês por R$ 100,00', 10000, 100, '{"stripe_price_id": "price_1UFaloBMqkVPUWioDTWXIPv6", "limite_notas_mes": 100, "preco_reais": 100}'::jsonb, true)
    ON CONFLICT (nome) DO UPDATE SET
      descricao = EXCLUDED.descricao,
      preco_mensal_centavos = EXCLUDED.preco_mensal_centavos,
      limite_notas_mes = EXCLUDED.limite_notas_mes,
      recursos = EXCLUDED.recursos,
      ativo = true;
  `);

  const planosRes = await client.query('SELECT id, nome, preco_mensal_centavos, limite_notas_mes, recursos FROM planos;');
  console.log('Planos ativos no banco:');
  console.table(planosRes.rows);

  await client.end();
  console.log('Migração concluída com sucesso!');
}

main().catch(err => {
  console.error('Erro na migração:', err);
  process.exit(1);
});
