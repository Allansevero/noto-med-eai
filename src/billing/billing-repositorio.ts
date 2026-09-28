/**
 * Porta do repositório de cobrança e assinaturas (SaaS / Stripe).
 * Isola as regras de limites e webhook da implementação do banco de dados (seção 3 do plano).
 */

import type { DadosUsoPlano } from './verificar-limite-emissao.js';

export interface ContaMedicoInfo {
  contaId: string;
  medicoId: string;
  email?: string;
  nome?: string;
  telefone?: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  planoNome: string;
  statusAssinatura: string;
}

export interface BillingRepositorio {
  buscarUsoELimiteMedico(medicoId: string): Promise<DadosUsoPlano>;
  buscarContaPorMedico(medicoId: string): Promise<ContaMedicoInfo | null>;
  buscarAssinaturaPorStripeSub(stripeSubscriptionId: string): Promise<{ assinaturaId: string; contaId: string; planoNome: string } | null>;
  atualizarAssinaturaStripe(params: {
    contaId?: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    status: 'ativa' | 'cancelada' | 'inadimplente' | 'trial';
    planoNome: string;
    dataProximaCobranca?: Date;
  }): Promise<void>;
  registrarFatura(params: {
    assinaturaId: string;
    valorCentavos: number;
    status: 'pago' | 'pendente';
    gatewayReferencia?: string;
    metodoPagamento?: string;
  }): Promise<void>;
}
