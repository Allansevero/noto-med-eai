import { describe, it } from 'node:test';
import assert from 'node:assert';
import { processarWebhookStripe } from './processar-webhook-stripe.js';
import type { BillingRepositorio, ContaMedicoInfo } from './billing-repositorio.js';
import type { DadosUsoPlano } from './verificar-limite-emissao.js';
import type Stripe from 'stripe';

class MockBillingRepositorio implements BillingRepositorio {
  assinaturasAtualizadas: any[] = [];
  faturasRegistradas: any[] = [];

  async buscarUsoELimiteMedico(_medicoId: string): Promise<DadosUsoPlano> {
    return {
      planoNome: 'Gratuito',
      notasHoje: 0,
      notasMes: 0,
      travaEmissao: false,
      assinaturaStatus: 'trial'
    };
  }

  async buscarContaPorMedico(_medicoId: string): Promise<ContaMedicoInfo | null> {
    return null;
  }

  async buscarAssinaturaPorStripeSub(subId: string) {
    return { assinaturaId: 'ass-123', contaId: 'conta-123', planoNome: 'Mensal' };
  }

  async atualizarAssinaturaStripe(params: any): Promise<void> {
    this.assinaturasAtualizadas.push(params);
  }

  async registrarFatura(params: any): Promise<void> {
    this.faturasRegistradas.push(params);
  }
}

describe('processarWebhookStripe', () => {
  it('deve ativar plano mensal no checkout.session.completed', async () => {
    const repo = new MockBillingRepositorio();
    const evento = {
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: 'conta-abc',
          customer: 'cus_123',
          subscription: 'sub_456'
        }
      }
    } as unknown as Stripe.Event;

    const res = await processarWebhookStripe(evento, { repositorio: repo });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(repo.assinaturasAtualizadas.length, 1);
    assert.strictEqual(repo.assinaturasAtualizadas[0].status, 'ativa');
    assert.strictEqual(repo.assinaturasAtualizadas[0].planoNome, 'Mensal');
    assert.strictEqual(repo.assinaturasAtualizadas[0].stripeSubscriptionId, 'sub_456');
  });

  it('deve reverter para plano gratuito no customer.subscription.deleted', async () => {
    const repo = new MockBillingRepositorio();
    const evento = {
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_456',
          customer: 'cus_123'
        }
      }
    } as unknown as Stripe.Event;

    const res = await processarWebhookStripe(evento, { repositorio: repo });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(repo.assinaturasAtualizadas[0].status, 'cancelada');
    assert.strictEqual(repo.assinaturasAtualizadas[0].planoNome, 'Gratuito');
  });

  it('deve registrar fatura paga no invoice.paid', async () => {
    const repo = new MockBillingRepositorio();
    const evento = {
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_789',
          subscription: 'sub_456',
          amount_paid: 10000
        }
      }
    } as unknown as Stripe.Event;

    const res = await processarWebhookStripe(evento, { repositorio: repo });

    assert.strictEqual(res.ok, true);
    assert.strictEqual(repo.faturasRegistradas.length, 1);
    assert.strictEqual(repo.faturasRegistradas[0].valorCentavos, 10000);
    assert.strictEqual(repo.faturasRegistradas[0].status, 'pago');
  });
});
