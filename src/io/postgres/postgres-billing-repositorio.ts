/**
 * Implementação PostgreSQL da porta `BillingRepositorio`.
 * Consulta limites diários/mensais de notas e persiste atualizações da Stripe (seção 3 do plano).
 */

import type pg from 'pg';
import type {
  BillingRepositorio,
  ContaMedicoInfo
} from '../../billing/billing-repositorio.js';
import type { DadosUsoPlano } from '../../billing/verificar-limite-emissao.js';
import {
  LIMITE_NOTAS_DIA_GRATUITO,
  LIMITE_NOTAS_MES_MENSAL,
  NOME_PLANO_GRATUITO
} from '../../billing/billing-config.js';

export class PostgresBillingRepositorio implements BillingRepositorio {
  constructor(private pool: pg.Pool) {}

  async buscarUsoELimiteMedico(medicoId: string): Promise<DadosUsoPlano> {
    const infoSql = `
      SELECT m.id AS medico_id, m.conta_id,
             COALESCE(p.nome, '${NOME_PLANO_GRATUITO}') AS plano_nome,
             p.limite_notas_mes,
             (p.recursos->>'limite_notas_dia')::int AS limite_notas_dia,
             COALESCE(a.status::text, 'trial') AS status_assinatura,
             COALESCE(a.trava_emissao, false) AS trava_emissao
      FROM medicos m
      LEFT JOIN assinaturas a ON a.conta_id = m.conta_id
      LEFT JOIN planos p ON p.id = a.plano_id
      WHERE m.id = $1
      LIMIT 1;
    `;
    const infoRes = await this.pool.query(infoSql, [medicoId]);
    const info = infoRes.rows[0];

    // Se o médico não tiver registro no banco, fallback seguro
    const planoNome = info?.plano_nome || NOME_PLANO_GRATUITO;
    const limiteNotasDia = info?.limite_notas_dia ?? LIMITE_NOTAS_DIA_GRATUITO;
    const limiteNotasMes = info?.limite_notas_mes ?? LIMITE_NOTAS_MES_MENSAL;
    const travaEmissao = info?.trava_emissao ?? false;
    const assinaturaStatus = info?.status_assinatura || 'trial';

    // Contagem de notas autorizadas hoje
    const hojeSql = `
      SELECT COUNT(*)::int AS total
      FROM notas_fiscais
      WHERE medico_id = $1 
        AND status = 'autorizada'
        AND (data_emissao::date = CURRENT_DATE OR criado_em::date = CURRENT_DATE);
    `;
    const hojeRes = await this.pool.query(hojeSql, [medicoId]);
    const notasHoje = hojeRes.rows[0]?.total || 0;

    // Contagem de notas autorizadas no mês corrente
    const mesSql = `
      SELECT COUNT(*)::int AS total
      FROM notas_fiscais
      WHERE medico_id = $1
        AND status = 'autorizada'
        AND (competencia = TO_CHAR(CURRENT_DATE, 'YYYY-MM') 
             OR TO_CHAR(criado_em, 'YYYY-MM') = TO_CHAR(CURRENT_DATE, 'YYYY-MM'));
    `;
    const mesRes = await this.pool.query(mesSql, [medicoId]);
    const notasMes = mesRes.rows[0]?.total || 0;

    return {
      planoNome,
      limiteNotasDia,
      limiteNotasMes,
      notasHoje,
      notasMes,
      travaEmissao,
      assinaturaStatus
    };
  }

  async buscarContaPorMedico(medicoId: string): Promise<ContaMedicoInfo | null> {
    const sql = `
      SELECT m.id AS medico_id, m.conta_id,
             u.email, u.nome, u.telefone,
             a.stripe_customer_id, a.stripe_subscription_id,
             COALESCE(p.nome, '${NOME_PLANO_GRATUITO}') AS plano_nome,
             COALESCE(a.status::text, 'trial') AS status_assinatura
      FROM medicos m
      JOIN contas c ON c.id = m.conta_id
      LEFT JOIN usuarios u ON u.conta_id = c.id
      LEFT JOIN assinaturas a ON a.conta_id = c.id
      LEFT JOIN planos p ON p.id = a.plano_id
      WHERE m.id = $1
      LIMIT 1;
    `;
    const res = await this.pool.query(sql, [medicoId]);
    if (res.rows.length === 0) return null;

    const row = res.rows[0];
    return {
      contaId: row.conta_id,
      medicoId: row.medico_id,
      email: row.email,
      nome: row.nome,
      telefone: row.telefone,
      stripeCustomerId: row.stripe_customer_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      planoNome: row.plano_nome,
      statusAssinatura: row.status_assinatura
    };
  }

  async buscarAssinaturaPorStripeSub(
    stripeSubscriptionId: string
  ): Promise<{ assinaturaId: string; contaId: string; planoNome: string } | null> {
    const sql = `
      SELECT a.id AS assinatura_id, a.conta_id, p.nome AS plano_nome
      FROM assinaturas a
      JOIN planos p ON p.id = a.plano_id
      WHERE a.stripe_subscription_id = $1
      LIMIT 1;
    `;
    const res = await this.pool.query(sql, [stripeSubscriptionId]);
    if (res.rows.length === 0) return null;

    return {
      assinaturaId: res.rows[0].assinatura_id,
      contaId: res.rows[0].conta_id,
      planoNome: res.rows[0].plano_nome
    };
  }

  async atualizarAssinaturaStripe(params: {
    contaId?: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    status: 'ativa' | 'cancelada' | 'inadimplente' | 'trial';
    planoNome: string;
    dataProximaCobranca?: Date;
  }): Promise<void> {
    // 1. Localiza o plano pelo nome
    const planoRes = await this.pool.query(
      `SELECT id FROM planos WHERE LOWER(nome) = LOWER($1) LIMIT 1;`,
      [params.planoNome]
    );
    const planoId = planoRes.rows[0]?.id;

    if (params.contaId) {
      const upsertSql = `
        INSERT INTO assinaturas (
          conta_id, plano_id, status, stripe_customer_id, stripe_subscription_id,
          data_proxima_cobranca, atualizado_em
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (conta_id) DO UPDATE SET
          plano_id = COALESCE(EXCLUDED.plano_id, assinaturas.plano_id),
          status = EXCLUDED.status,
          stripe_customer_id = COALESCE(EXCLUDED.stripe_customer_id, assinaturas.stripe_customer_id),
          stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, assinaturas.stripe_subscription_id),
          data_proxima_cobranca = COALESCE(EXCLUDED.data_proxima_cobranca, assinaturas.data_proxima_cobranca),
          trava_emissao = CASE WHEN EXCLUDED.status = 'inadimplente' THEN true ELSE false END,
          atualizado_em = NOW();
      `;
      await this.pool.query(upsertSql, [
        params.contaId,
        planoId,
        params.status,
        params.stripeCustomerId,
        params.stripeSubscriptionId,
        params.dataProximaCobranca || null
      ]);
      return;
    }

    // Atualização por stripeSubscriptionId ou stripeCustomerId
    const updateSql = `
      UPDATE assinaturas
      SET status = $1,
          plano_id = COALESCE($2, plano_id),
          data_proxima_cobranca = COALESCE($3, data_proxima_cobranca),
          trava_emissao = CASE WHEN $1 = 'inadimplente' THEN true ELSE false END,
          atualizado_em = NOW()
      WHERE stripe_subscription_id = $4 OR stripe_customer_id = $5;
    `;
    await this.pool.query(updateSql, [
      params.status,
      planoId || null,
      params.dataProximaCobranca || null,
      params.stripeSubscriptionId,
      params.stripeCustomerId
    ]);
  }

  async registrarFatura(params: {
    assinaturaId: string;
    valorCentavos: number;
    status: 'pago' | 'pendente';
    gatewayReferencia?: string;
    metodoPagamento?: string;
  }): Promise<void> {
    const sql = `
      INSERT INTO faturas_assinatura (
        assinatura_id, valor_centavos, status, vencimento, pago_em, gateway_referencia, metodo_pagamento
      )
      VALUES ($1, $2, $3, CURRENT_DATE, CASE WHEN $3 = 'pago' THEN NOW() ELSE NULL END, $4, $5);
    `;
    await this.pool.query(sql, [
      params.assinaturaId,
      params.valorCentavos,
      params.status,
      params.gatewayReferencia || null,
      params.metodoPagamento || 'cartao_credito'
    ]);
  }
}
