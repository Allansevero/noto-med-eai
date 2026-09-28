/**
 * Caso de uso: Processamento de eventos de webhook da Stripe.
 * Atualiza o plano do médico para Mensal (100 notas/mês) ou Gratuito (5 notas/dia)
 * e registra faturas sem dependência direta do framework HTTP (seção 3 do plano).
 */

import type Stripe from 'stripe';
import type { BillingRepositorio } from './billing-repositorio.js';
import { NOME_PLANO_GRATUITO, NOME_PLANO_MENSAL } from './billing-config.js';

export interface ProcessarWebhookStripeDeps {
  repositorio: BillingRepositorio;
}

export type ResultadoProcessarWebhookStripe =
  | { ok: true; evento: string; acao: string }
  | { ok: false; motivo: 'evento_nao_tratado' | 'dados_insuficientes' };

export async function processarWebhookStripe(
  evento: Stripe.Event,
  deps: ProcessarWebhookStripeDeps
): Promise<ResultadoProcessarWebhookStripe> {
  switch (evento.type) {
    case 'checkout.session.completed': {
      const session = evento.data.object as Stripe.Checkout.Session;
      const contaId = session.client_reference_id || session.metadata?.contaId;
      const stripeCustomerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
      const stripeSubscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

      if (!stripeCustomerId || !stripeSubscriptionId) {
        return { ok: false, motivo: 'dados_insuficientes' };
      }

      await deps.repositorio.atualizarAssinaturaStripe({
        contaId: contaId || undefined,
        stripeCustomerId,
        stripeSubscriptionId,
        status: 'ativa',
        planoNome: NOME_PLANO_MENSAL
      });

      return { ok: true, evento: evento.type, acao: 'assinatura_ativada' };
    }

    case 'customer.subscription.updated': {
      const sub = evento.data.object as Stripe.Subscription;
      const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
      const stripeSubscriptionId = sub.id;

      const statusMapeado: 'ativa' | 'inadimplente' | 'cancelada' =
        sub.status === 'active'
          ? 'ativa'
          : sub.status === 'past_due' || sub.status === 'unpaid'
          ? 'inadimplente'
          : 'cancelada';

      const dataProximaCobranca = (sub as any).current_period_end
        ? new Date((sub as any).current_period_end * 1000)
        : undefined;

      await deps.repositorio.atualizarAssinaturaStripe({
        stripeCustomerId,
        stripeSubscriptionId,
        status: statusMapeado,
        planoNome: statusMapeado === 'cancelada' ? NOME_PLANO_GRATUITO : NOME_PLANO_MENSAL,
        dataProximaCobranca
      });

      return { ok: true, evento: evento.type, acao: `status_atualizado_${statusMapeado}` };
    }

    case 'customer.subscription.deleted': {
      const sub = evento.data.object as Stripe.Subscription;
      const stripeCustomerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

      await deps.repositorio.atualizarAssinaturaStripe({
        stripeCustomerId,
        stripeSubscriptionId: sub.id,
        status: 'cancelada',
        planoNome: NOME_PLANO_GRATUITO
      });

      return { ok: true, evento: evento.type, acao: 'assinatura_cancelada_revertido_gratuito' };
    }

    case 'invoice.paid': {
      const invoice = evento.data.object as Stripe.Invoice;
      const subId = typeof (invoice as any).subscription === 'string'
        ? (invoice as any).subscription
        : (invoice as any).subscription?.id;

      if (subId) {
        const subRegistro = await deps.repositorio.buscarAssinaturaPorStripeSub(subId);
        if (subRegistro) {
          await deps.repositorio.registrarFatura({
            assinaturaId: subRegistro.assinaturaId,
            valorCentavos: invoice.amount_paid || 10000,
            status: 'pago',
            gatewayReferencia: invoice.id,
            metodoPagamento: 'cartao_credito'
          });
        }
      }

      return { ok: true, evento: evento.type, acao: 'fatura_registrada' };
    }

    default:
      return { ok: false, motivo: 'evento_nao_tratado' };
  }
}
