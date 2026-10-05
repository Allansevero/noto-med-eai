/** Confirmação e emissão devem usar a mesma referência importada, sem omitir IBS/CBS. */
import { ibscbsSchema, type ParametrosIbscbs } from './ibscbs.js';
export interface ReferenciaFiscalPersistida {
  versao?: number;
  hash?: string;
  pendencias?: string[];
  ibscbsPresente?: boolean;
  servico?: { ctribNac: string; ctribMun: string | null; cnbs: string | null };
  parametrosSugeridos?: Record<string, unknown>;
}
export function validarReferenciaFiscal(
  referencia: ReferenciaFiscalPersistida | null | undefined,
  politica: { referenciaHash?: string; fidelidadeReferencia?: boolean; ctribNac?: string; ctribMun?: string | null; cnbs?: string | null; parametros: { ibscbs?: ParametrosIbscbs } }
): string[] {
  if (referencia?.versao !== 2) return politica.parametros.ibscbs ? ['Importe novamente o XML para comprovar os parâmetros IBS/CBS.'] : [];
  const erros = [...(referencia.pendencias || [])];
  if (!referencia.hash || referencia.hash !== politica.referenciaHash) erros.push('A nota de referência mudou. Reabra a revisão e confirme os dados atuais.');
  const importado = ibscbsSchema.safeParse(referencia.parametrosSugeridos?.ibscbs);
  if (referencia.ibscbsPresente) {
    const confirmado = ibscbsSchema.safeParse(politica.parametros.ibscbs);
    if (!importado.success || !confirmado.success || JSON.stringify(importado.data) !== JSON.stringify(confirmado.data)) {
      erros.push('Os parâmetros IBS/CBS precisam corresponder à nota de referência apresentada.');
    }
  } else if (politica.parametros.ibscbs) erros.push('A nota de referência não comprova os parâmetros IBS/CBS informados.');
  if (politica.fidelidadeReferencia) {
    if (!referencia.servico) erros.push('Busque novamente sua nota pelo certificado para conferir o serviço da referência.');
    else for (const campo of ['ctribNac', 'ctribMun', 'cnbs'] as const) {
      if (politica[campo] !== referencia.servico[campo]) erros.push(`O serviço em ${campo} difere da nota de referência.`);
    }
    const campos = ['ambiente', 'municipioPrestacao', 'opcaoSimplesNacional', 'regimeApuracaoSn',
      'regimeEspecialTributacao', 'tribISSQN', 'tpRetISSQN', 'cstPisCofins', 'percentualTotTribSN'];
    for (const campo of campos) {
      if (referencia.parametrosSugeridos?.[campo] !== (politica.parametros as Record<string, unknown>)[campo]) {
        erros.push(`A configuração de ${campo} difere da nota de referência.`);
      }
    }
  }
  return erros;
}
