import { z } from 'zod';

const consultaSchema = z.object({
  pacienteId: z.string().min(1), idExterno: z.string().min(1), dataHora: z.string().min(1),
  status: z.enum(['realizada', 'cancelada', 'faltou', 'agendada']),
  valorConsultaCentavos: z.number().int().nullable().optional()
}).strict();
const resultadoSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('consultas'), fonte: z.string().min(1), consultas: z.array(consultaSchema) }).strict(),
  z.object({ tipo: z.literal('erro'), codigo: z.enum(['FONTE_INDISPONIVEL', 'ACESSO_EXPIRADO', 'SEM_AGENDA_CONECTADA']) }).strict()
]);
export interface EntradaFonteAgenda { medicoId: string; referenciaCofre: string }
export type ResultadoFonteAgenda = z.infer<typeof resultadoSchema>;
export type ConsultaSincronizada = Omit<z.infer<typeof consultaSchema>, 'valorConsultaCentavos'> & { valorConsultaCentavos: number | null };
export interface FonteAgenda { consultar(entrada: EntradaFonteAgenda): Promise<ResultadoFonteAgenda> }
export interface RepositorioConsultasSincronizadas {
  salvar(medicoId: string, fonte: string, consultas: ConsultaSincronizada[]): Promise<void>;
}

/** Pura: restringe os campos ao contrato, sem inferir preço nem situação de conexão. */
export function normalizarResultadoAgenda(resultado: unknown) {
  const dados = resultadoSchema.parse(resultado);
  if (dados.tipo === 'erro') return dados;
  return { ...dados, consultas: dados.consultas.map(consulta => ({ ...consulta, valorConsultaCentavos: consulta.valorConsultaCentavos ?? null })) };
}
