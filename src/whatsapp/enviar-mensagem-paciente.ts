/**
 * Porta para envio de mensagens ativas na conversa do paciente via Evolution API.
 * Usada estritamente nas únicas duas situações autorizadas pelo plano:
 * 1. Pedido de reenvio de CPF na emissão (seção 2.3).
 * 2. Envio do PDF (DANFSe) após autorização da nota (seção 3.2, item 6).
 */

export interface EnviarMensagemPacienteParams {
  instanciaNome: string;
  contatoTelefone: string;
  texto: string;
}

export interface ResultadoEnvioMensagemPaciente {
  sucesso: boolean;
  mensagemId?: string;
  erro?: string;
}

export interface EnviarMensagemPaciente {
  enviarTexto(params: EnviarMensagemPacienteParams): Promise<ResultadoEnvioMensagemPaciente>;
}
