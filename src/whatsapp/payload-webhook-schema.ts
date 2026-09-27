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
      .optional()
  })
  .optional();

export const dadosMensagemSchema = z.object({
  key: mensagemKeySchema,
  pushName: z.string().optional().nullable(),
  message: conteudoMensagemSchema,
  messageTimestamp: z.union([z.number(), z.string()]).optional()
});

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

  return null;
}
