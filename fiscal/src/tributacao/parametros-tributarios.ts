/**
 * Regras puras para consolidação de parâmetros tributários médicos.
 * Prepara alíquotas de ISS, retenções federais e discriminação padrão
 * com base no regime da clínica (Simples Nacional ou Lucro Presumido).
 */

import type { ParametrosFiscaisExtraidos } from '../../../contratos/tipos-fiscal.js';

export interface ParametrosTributariosEntrada {
  regimeTributario?: string;
  optanteSimples?: boolean;
  aliquotaIss?: number;
  codigoTributacaoNacional?: string;
  descricaoServicoPadrao?: string;
}

export function consolidarParametrosFiscais(
  entrada: ParametrosTributariosEntrada
): ParametrosFiscaisExtraidos {
  const optanteSimples = entrada.optanteSimples ?? (entrada.regimeTributario?.includes('simples') ?? true);
  const aliquotaIss = entrada.aliquotaIss && entrada.aliquotaIss > 0 ? entrada.aliquotaIss : 2.01;
  const codigoTributacaoNacional = entrada.codigoTributacaoNacional?.replace(/\D/g, '') || '040101';
  const descricaoServicoPadrao = entrada.descricaoServicoPadrao?.trim() || 'Consulta médica em clínica médica geral';

  return {
    regimeTributario: entrada.regimeTributario || (optanteSimples ? 'simples_nacional' : 'lucro_presumido'),
    optanteSimples,
    aliquotaIss,
    codigoTributacaoNacional,
    descricaoServicoPadrao,
    reformaTributaria: {
      cbsAliquota: 0.0,
      ibsAliquota: 0.0
    }
  };
}
