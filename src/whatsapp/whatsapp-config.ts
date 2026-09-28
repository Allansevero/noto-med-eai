/**
 * Constantes de negócio para integração com WhatsApp via Evolution API.
 * Define textos-modelo padrão de respostas rápidas e tipos de eventos
 * sem dependência de variáveis de ambiente.
 */

export const TEXTO_MODELO_PADRAO_AGENDADO = 'Consulta agendada!';
export const TEXTO_MODELO_PADRAO_EMISSAO = 'Vou enviar em instantes a sua NF no valor de R$';
export const MENSAGEM_PEDIDO_CPF = 'poderia por favor me reenviar o seu CPF para emissão da nota fiscal?';

export const EVENTOS_EVOLUTION = {
  MESSAGES_UPSERT: 'messages.upsert',
  MESSAGES_UPDATE: 'messages.update',
  CONNECTION_UPDATE: 'connection.update'
} as const;

export type TipoRespostaRapida = 'agendado' | 'emissao';
