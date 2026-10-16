/**
 * Enquadramento de serviços médicos na Reforma Tributária do Consumo (RTC 2026).
 * Emenda Constitucional 132/2023, PLP 68/2024 e Nota Técnica DPS Nacional 1.01.
 * Determina a redução constitucional de 60% para saúde e monta grupo IBSCBS.
 */

export interface ServicoSaudeInput {
  ctribNac: string;
  cnbs?: string | null;
  tomadorCpf?: boolean;
  opcaoSimplesNacional?: 'nao_optante' | 'mei' | 'me_epp';
  beneficioReducaoSaude?: boolean;
}

export interface ParametrosIbscbs {
  finNFSe: '0';
  indFinal?: '0' | '1';
  cIndOp: string;
  indDest: '0';
  CST: string;
  cClassTrib: string;
}

export function ehServicoSaude(ctribNac: string, cnbs?: string | null): boolean {
  const nacLimpo = ctribNac.replace(/\D/g, '');
  if (nacLimpo.startsWith('0401')) return true;
  if (cnbs && cnbs.replace(/\D/g, '').startsWith('12205')) return true;
  return false;
}

export function sugerirIbscbsSaude(input: ServicoSaudeInput): ParametrosIbscbs {
  const indFinal = input.tomadorCpf ? '1' : '0';
  const cIndOp = '100301';
  const indDest = '0';
  const finNFSe = '0';

  if (input.opcaoSimplesNacional === 'mei') {
    return { finNFSe, indFinal, cIndOp, indDest, CST: '999', cClassTrib: '000001' };
  }

  // Redução constitucional de 60% para medicina humana (art. 9º § 1º II EC 132/23)
  if (input.beneficioReducaoSaude !== false) {
    return { finNFSe, indFinal, cIndOp, indDest, CST: '200', cClassTrib: '200001' };
  }

  return { finNFSe, indFinal, cIndOp, indDest, CST: '000', cClassTrib: '000001' };
}
