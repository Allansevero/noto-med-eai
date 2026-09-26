/**
 * Porta de envio de OTP via WhatsApp pela instância oficial da plataforma.
 * Isola a integração HTTP da Evolution API da regra de negócio de login,
 * garantindo que a mensagem nunca seja enviada pela instância do médico nem por SMS.
 */

export interface EnviarOtpParams {
  telefone: string;
  codigo: string;
}

export interface ResultadoEnvioOtp {
  sucesso: boolean;
  erro?: string;
}

export interface EnviarOtpWhatsapp {
  enviar(params: EnviarOtpParams): Promise<ResultadoEnvioOtp>;
}

export function formatarMensagemOtp(codigo: string, ttlMinutos: number = 5): string {
  return `Seu código de verificação é *${codigo}*.\n\nVálido por ${ttlMinutos} minutos. Se você não solicitou este código, ignore esta mensagem.`;
}
