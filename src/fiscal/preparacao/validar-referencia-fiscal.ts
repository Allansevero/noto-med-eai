/** Confirmação e emissão devem usar a mesma referência importada, sem omitir IBS/CBS. */
import { ibscbsSchema, type ParametrosIbscbs } from './ibscbs.js';
export interface ReferenciaFiscalPersistida {
  versao?: number;
  hash?: string;
  pendencias?: string[];
  ibscbsPresente?: boolean;
  parametrosSugeridos?: { ibscbs?: unknown };
}
export function validarReferenciaFiscal(
  referencia: ReferenciaFiscalPersistida | null | undefined,
  politica: { referenciaHash?: string; parametros: { ibscbs?: ParametrosIbscbs } }
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
  return erros;
}
