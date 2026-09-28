/**
 * Constantes de negócio para cobrança, assinaturas e limites de notas fiscais (SaaS).
 * Isoladas de process.env para manter regras de negócio puras e testáveis.
 */

export const LIMITE_NOTAS_DIA_GRATUITO = 5;
export const LIMITE_NOTAS_MES_MENSAL = 100;
export const PRECO_PLANO_MENSAL_REAIS = 100;
export const PRECO_PLANO_MENSAL_CENTAVOS = 10000;

export const NOME_PLANO_GRATUITO = 'Gratuito';
export const NOME_PLANO_MENSAL = 'Mensal';

export const MENSAGENS_BLOQUEIO_LIMITE = {
  LIMITE_DIARIO_GRATUITO: (hoje: number, max: number, checkoutUrl?: string) =>
    `Você atingiu o limite de ${max} notas fiscais gratuitas de hoje (${hoje}/${max}). Para emitir sem interrupção (até 100 notas/mês), assine o Plano Mensal por R$ 100/mês${checkoutUrl ? `: ${checkoutUrl}` : '.'}`,

  LIMITE_MENSAL_ATINGIDO: (mes: number, max: number, upgradeUrl?: string) =>
    `Você atingiu o limite de ${max} notas fiscais do seu Plano Mensal neste mês (${mes}/${max}).${upgradeUrl ? ` Acesse ${upgradeUrl} para contratar notas adicionais.` : ''}`,

  INADIMPLENTE: 'Sua assinatura mensal possui pendências financeiras. Atualize seu meio de pagamento para liberar novas emissões.',

  TRAVA_MANUAL: 'Emissões temporariamente suspensas para esta conta. Entre em contato com o suporte.'
} as const;
