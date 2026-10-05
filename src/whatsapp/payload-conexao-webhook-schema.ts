/** Eventos de conexão têm um payload distinto das mensagens do WhatsApp. */
import { z } from 'zod';

export const conexaoWebhookSchema = z.object({
  event: z.string().transform(evento => evento.trim().toLowerCase().replaceAll('_', '.'))
    .pipe(z.literal('connection.update')),
  instance: z.string().min(1),
  data: z.object({ state: z.enum(['open', 'close', 'connecting']) })
});
