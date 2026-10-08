/**
 * Portas de notificação para falhas de emissão e incidentes operacionais.
 * 1. Avisa o médico pelo WhatsApp oficial da plataforma (nunca paciente, seção 3.2 item 7).
 * 2. Avisa o desenvolvedor por e-mail via Resend em caso de bug inesperado (item 8).
 */

export interface NotificarMedicoParams {
  telefoneMedico: string;
  medicoId?:string;
  solicitacaoId?:string;
  nomePaciente?: string | null;
  valorCentavos: number;
  motivoErro: string;
}

export interface NotificarDesenvolvedorParams {
  assunto: string;
  detalhesErro: string;
  solicitacaoId?: string;
  medicoId?: string;
}

export interface NotificadorAlertas {
  notificarMedicoWhatsApp(params: NotificarMedicoParams): Promise<void>;
  notificarDesenvolvedorEmail(params: NotificarDesenvolvedorParams): Promise<void>;
}

