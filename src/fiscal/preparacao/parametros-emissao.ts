/**
 * Contrato da política fiscal revisada para um serviço. Não há defaults fiscais:
 * somente opções que o serializador atual consegue representar são aceitas.
 */
import { z } from 'zod';
import { ibscbsSchema } from './ibscbs.js';
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T12:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Data inválida');
export const parametrosEmissaoSchema = z.object({
  ibscbs: ibscbsSchema.optional(),
  ambiente: z.enum(['producao', 'homologacao']),
  vigenciaInicio: data,
  vigenciaFim: data.optional(),
  municipioPrestacao: z.string().regex(/^\d{7}$/),
  opcaoSimplesNacional: z.enum(['mei', 'me_epp']),
  regimeApuracaoSn: z.enum(['regime_1', 'regime_2', 'regime_3']).optional(),
  regimeEspecialTributacao: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(9)]),
  tribISSQN: z.literal(1, { errorMap: () => ({ message: 'Esta situação de ISSQN exige suporte fiscal adicional; não será substituída por operação tributável.' }) }),
  tpRetISSQN: z.literal(1, { errorMap: () => ({ message: 'Retenção exige cálculo ainda não suportado; não será substituída por não retido.' }) }),
  cstPisCofins: z.enum(['04', '06', '07', '08', '09']).optional(),
  percentualTotTribSN: z.number().finite().min(0).max(100).optional()
}).strict().superRefine((v, ctx) => {
  if (v.vigenciaFim && v.vigenciaFim < v.vigenciaInicio) ctx.addIssue({ code: 'custom', path: ['vigenciaFim'], message: 'Fim anterior ao início' });
  if (v.opcaoSimplesNacional === 'me_epp') {
    for (const campo of ['regimeApuracaoSn', 'cstPisCofins', 'percentualTotTribSN'] as const) {
      if (v[campo] === undefined) ctx.addIssue({ code: 'custom', path: [campo], message: 'Confirmação necessária para ME/EPP' });
    }
  } else {
    for (const campo of ['regimeApuracaoSn', 'cstPisCofins', 'percentualTotTribSN'] as const) {
      if (v[campo] !== undefined) ctx.addIssue({ code: 'custom', path: [campo], message: 'Não informar para MEI' });
    }
  }
});
export type ParametrosEmissao = z.infer<typeof parametrosEmissaoSchema>;
export interface PoliticaEmissao {
  referenciaHash?: string;
  parametros: ParametrosEmissao;
  confirmadoEm: string;
  origem: 'revisao_onboarding';
  ctribNac: string;
  cnbs: string | null;
  ctribMun: string | null;
  perfil: { ambiente: string; opcao: string; regime: string | null; especial: number; municipio: string; serie: string; referencia: string | null };
}
