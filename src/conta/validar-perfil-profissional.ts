/**
 * Normaliza os campos editáveis da conta antes de gravar. Identificação
 * profissional é independente da razão social usada pelo emitente fiscal.
 */
import { z } from 'zod';

const texto = z.string().transform(valor => valor.trim().replace(/\s+/g, ' '));
const registro = texto.pipe(z.string().max(60, 'O registro deve ter até 60 caracteres.'))
  .nullable().transform(valor => valor || null).optional();

export const perfilProfissionalSchema = z.object({
  medicoId: z.string().uuid('Identificador do médico inválido.'),
  usuarioId: z.string().uuid('Identificador do usuário inválido.').optional(),
  nome: texto.pipe(z.string().min(2, 'Informe o nome completo.')
    .max(200, 'O nome deve ter até 200 caracteres.')).optional(),
  crm: registro,
  rqe: registro
}).strict().refine(dados => dados.nome !== undefined || dados.crm !== undefined || dados.rqe !== undefined,
  'Informe um campo para atualizar.');
