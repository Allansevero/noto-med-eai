/**
 * Portas de notificação para falhas de emissão e incidentes operacionais.
 * 1. Avisa o médico pelo WhatsApp oficial da plataforma (nunca paciente, seção 3.2 item 7).
 * 2. Avisa o desenvolvedor por e-mail via Resend em caso de bug inesperado (item 8).
 */

export interface NotificarMedicoParams {
  telefoneMedico: string;
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

export function formatarMensagemErroMedico(
  params: NotificarMedicoParams
): string {
  const paciente = params.nomePaciente ? `do(a) paciente ${params.nomePaciente}` : 'do paciente';
  const valor = (params.valorCentavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  return `⚠️ *Aviso de Emissão de Nota Fiscal*\n\nNão foi possível emitir automaticamente a NFS-e ${paciente} no valor de ${valor}.\n\n*Motivo:* ${params.motivoErro}\n\nNenhuma mensagem de erro foi enviada ao seu paciente. Por favor, verifique os dados no sistema.`;
}
