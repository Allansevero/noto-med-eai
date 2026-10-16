/**
 * Resolução pura do valor monetário do serviço da NFS-e.
 * Prioriza o valor informado diretamente pelo médico no texto do pedido,
 * recorrendo ao valor registrado na fonte (comprovante anterior ou planilha).
 * Valida limites mínimos (R$ 1,00) e máximos razoáveis (R$ 50.000,00).
 */

export const VALOR_MAXIMO_CENTAVOS = 5_000_000; // R$ 50.000,00
export const VALOR_MINIMO_CENTAVOS = 100;       // R$ 1,00

export interface EscolherValorParams {
  valorTextoCentavos?: number | null;
  valorFonteCentavos?: number | null;
}

export function escolherValorSugerido(params: EscolherValorParams): number | null {
  if (params.valorTextoCentavos !== undefined && params.valorTextoCentavos !== null) {
    if (validarValorCentavos(params.valorTextoCentavos)) {
      return params.valorTextoCentavos;
    }
  }

  if (params.valorFonteCentavos !== undefined && params.valorFonteCentavos !== null) {
    if (validarValorCentavos(params.valorFonteCentavos)) {
      return params.valorFonteCentavos;
    }
  }

  return null;
}

export function validarValorCentavos(centavos: unknown): boolean {
  if (typeof centavos !== 'number' || !Number.isFinite(centavos)) {
    return false;
  }
  return centavos >= VALOR_MINIMO_CENTAVOS && centavos <= VALOR_MAXIMO_CENTAVOS;
}
