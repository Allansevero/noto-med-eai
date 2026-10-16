/**
 * Schema de validação Zod para payloads de webhook da Evolution API.
 * Garante tipagem estrita e sanitização dos dados antes de qualquer
 * interação com regras de negócio ou banco de dados (conforme seção 4.3 do plano).
 */

import { z } from 'zod';

export const mensagemKeySchema = z.object({
  remoteJid: z.string().min(1),
  remoteJidAlt: z.string().optional().nullable(),
  fromMe: z.boolean(),
  id: z.string().min(1)
});

export const conteudoMensagemSchema = z
  .object({
    conversation: z.string().optional(),
    extendedTextMessage: z
      .object({
        text: z.string().optional()
      })
      .passthrough()
      .optional(),
    imageMessage: z
      .object({
        caption: z.string().optional(),
        url: z.string().optional(),
        mimetype: z.string().optional()
      })
      .passthrough()
      .optional(),
    documentMessage: z
      .object({
        caption: z.string().optional(),
        fileName: z.string().optional(),
        url: z.string().optional(),
        mimetype: z.string().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough()
  .optional();

export const dadosMensagemSchema = z.object({
  key: mensagemKeySchema,
  pushName: z.string().optional().nullable(),
  message: conteudoMensagemSchema,
  messageType: z.string().optional(),
  messageTimestamp: z.union([z.number(), z.string()]).optional()
}).passthrough();

export const webhookEvolutionSchema = z.object({
  event: z.string().min(1),
  instance: z.string().min(1),
  data: dadosMensagemSchema
});

export type WebhookEvolutionPayload = z.infer<typeof webhookEvolutionSchema>;
export type DadosMensagemEvolution = z.infer<typeof dadosMensagemSchema>;

export function extrairTextoMensagem(dados?: DadosMensagemEvolution | null): string | null {
  const msg = desembrulharConteudoMensagem(dados?.message);
  if (!msg) return null;

  const candidato =
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.documentMessage?.caption ||
    msg.contactMessage?.vcard ||
    extrairTextoContactsArray(msg.contactsArrayMessage);

  return typeof candidato === 'string' && candidato.trim().length > 0
    ? candidato.trim()
    : null;
}

export function extrairTextoPayloadBruto(payloadBruto: unknown): string | null {
  if (!payloadBruto || typeof payloadBruto !== 'object') return null;
  const registro = payloadBruto as Record<string, any>;
  if (registro.message) {
    return extrairTextoMensagem(registro as DadosMensagemEvolution);
  }
  return extrairTextoMensagem({ key: { remoteJid: 'x', fromMe: false, id: 'x' }, message: registro });
}

export function extrairTipoMensagem(dados?: DadosMensagemEvolution | null): 'imagem' | 'documento' | 'texto' {
  const msg = desembrulharConteudoMensagem(dados?.message);
  if (!msg) return 'texto';
  if (msg.imageMessage || dados?.messageType === 'imageMessage') return 'imagem';
  if (msg.documentMessage || dados?.messageType === 'documentMessage' || dados?.messageType === 'documentWithCaptionMessage') {
    return 'documento';
  }
  return 'texto';
}

function desembrulharConteudoMensagem(msg: any, profundidade = 0): Record<string, any> | null {
  if (!msg || typeof msg !== 'object' || profundidade > 4) return null;

  const aninhado =
    msg.ephemeralMessage?.message ||
    msg.viewOnceMessage?.message ||
    msg.viewOnceMessageV2?.message ||
    msg.viewOnceMessageV2Extension?.message ||
    msg.documentWithCaptionMessage?.message ||
    msg.editedMessage?.message?.protocolMessage?.editedMessage ||
    msg.editedMessage?.message ||
    msg.protocolMessage?.editedMessage;

  if (aninhado && typeof aninhado === 'object') {
    return desembrulharConteudoMensagem(aninhado, profundidade + 1) ?? aninhado;
  }

  return msg;
}

function extrairTextoContactsArray(contactsArray: any): string | null {
  if (!contactsArray || !Array.isArray(contactsArray.contacts)) return null;
  const vcards = contactsArray.contacts
    .map((c: any) => (typeof c?.vcard === 'string' ? c.vcard.trim() : ''))
    .filter(Boolean);
  return vcards.length > 0 ? vcards.join('\n') : null;
}


