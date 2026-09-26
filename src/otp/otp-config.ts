/**
 * Constantes de negócio para o fluxo de OTP (login/cadastro por WhatsApp).
 * Isoladas de process.env para que regras puras e testes possam importá-las
 * sem depender de carregamento de ambiente externo ou efeitos colaterais.
 */

export const TTL_OTP_MINUTOS = 5;
export const TAMANHO_CODIGO_OTP = 6;
export const LIMITE_TENTATIVAS_OTP = 5;
export const COOLDOWN_REENVIO_SEGUNDOS = 60;
