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

export function extrairTextoMensagem(dados?: DadosMensagemEvolution): string | null {
  if (!dados || !dados.message) {
    return null;
  }

  if (dados.message.conversation) {
    return dados.message.conversation.trim();
  }

  if (dados.message.extendedTextMessage?.text) {
    return dados.message.extendedTextMessage.text.trim();
  }

  if (dados.message.imageMessage?.caption) {
    return dados.message.imageMessage.caption.trim();
  }

  if (dados.message.documentMessage?.caption) {
    return dados.message.documentMessage.caption.trim();
  }

  return null;
}

export function extrairTipoMensagem(dados?: DadosMensagemEvolution): 'imagem' | 'documento' | 'texto' {
  if (!dados || !dados.message) return 'texto';
  if (dados.message.imageMessage || dados.messageType === 'imageMessage') return 'imagem';
  if (dados.message.documentMessage || dados.messageType === 'documentMessage') return 'documento';
  return 'texto';
}

