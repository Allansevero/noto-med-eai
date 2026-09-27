/**
 * Mapeamento puro dos dois primeiros dígitos do código de município IBGE
 * para a sigla da UF correspondente (tabela IBGE). Usado na extração fiscal
 * para garantir UF válida mesmo quando o XML não traz a tag de endereço.
 */

const MAPA_IBGE_UF: Record<string, string> = {
  '11': 'RO', '12': 'AC', '13': 'AM', '14': 'RR', '15': 'PA', '16': 'AP', '17': 'TO',
  '21': 'MA', '22': 'PI', '23': 'CE', '24': 'RN', '25': 'PB', '26': 'PE', '27': 'AL', '28': 'SE', '29': 'BA',
  '31': 'MG', '32': 'ES', '33': 'RJ', '35': 'SP',
  '41': 'PR', '42': 'SC', '43': 'RS',
  '50': 'MS', '51': 'MT', '52': 'GO', '53': 'DF'
};

export function inferirUfDeMunicipioIbge(codMunicipioIbge: string): string | null {
  if (!codMunicipioIbge || codMunicipioIbge.length < 2) return null;
  const prefixo = codMunicipioIbge.slice(0, 2);
  return MAPA_IBGE_UF[prefixo] ?? null;
}
