/**
 * Wrapper de integração com a API da Stripe para pagamentos e checkout.
 * Isola a biblioteca 'stripe' em um módulo focado em I/O (seção 3 do plano).
 */

import Stripe from 'stripe';

export interface StripeServiceConfig {
  secretKey: string;
  priceId: string;
  webhookSecret?: string;
}

export class StripeService {
  private stripe: Stripe;
  private priceId: string;
  private webhookSecret?: string;

  constructor(config: StripeServiceConfig) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: '2025-02-24.acacia' as any
    });
    this.priceId = config.priceId;
    this.webhookSecret = config.webhookSecret;
  }

  async criarSessaoCheckout(params: {
    medicoId: string;
    contaId: string;
    customerEmail?: string;
    telefone?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<string> {
    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: this.priceId,
          quantity: 1
        }
      ],
      customer_email: params.customerEmail,
      client_reference_id: params.contaId,
      metadata: {
        medicoId: params.medicoId,
        contaId: params.contaId,
        telefone: params.telefone || ''
      },
      subscription_data: {
        metadata: {
          medicoId: params.medicoId,
          contaId: params.contaId
        }
      },
      success_url: params.successUrl,
      cancel_url: params.cancelUrl
    });

    if (!session.url) {
      throw new Error('Stripe não retornou URL para sessão de checkout');
    }

    return session.url;
  }

  async criarSessaoPortal(params: {
    stripeCustomerId: string;
    returnUrl: string;
  }): Promise<string> {
    const portal = await this.stripe.billingPortal.sessions.create({
      customer: params.stripeCustomerId,
      return_url: params.returnUrl
    });

    return portal.url;
  }

  construirEventoWebhook(body: string | Buffer, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      // Se não houver webhook secret configurado, faz o parse seguro do payload
      return JSON.parse(body.toString()) as Stripe.Event;
    }
    return this.stripe.webhooks.constructEvent(body, signature, this.webhookSecret);
  }
}
