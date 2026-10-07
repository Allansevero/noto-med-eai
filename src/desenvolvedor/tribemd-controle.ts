import { z } from 'zod';
export const controleLoginTribemd=z.discriminatedUnion('tipo',[
 z.object({tipo:z.literal('clicar'),x:z.number().int().min(0).max(1279),y:z.number().int().min(0).max(899)}).strict(),
 z.object({tipo:z.literal('digitar'),texto:z.string().min(1).max(256)}).strict(),
 z.object({tipo:z.literal('tecla'),tecla:z.enum(['Tab','Shift+Tab','Backspace','Delete','Enter','Escape','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'])}).strict(),
 z.object({tipo:z.literal('rolar'),deltaY:z.number().int().min(-900).max(900)}).strict(),
]);
export type ControleLoginTribemd=z.infer<typeof controleLoginTribemd>;
