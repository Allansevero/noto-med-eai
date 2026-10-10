/**
 * Regras puras de enquadramento de serviços médicos na Reforma Tributária
 * (Emenda Constitucional 132/2023, PLP 68/2024 e Nota Técnica 009 v1.01).
 * Identifica serviços de medicina/saúde (cTribNac 0401xx / NBS 12205xxxx),
 * define se o tomador é consumidor final e sugere ou valida o grupo IBSCBS
 * com a redução constitucional de 60% ou tributação padrão.
 */

import type { ParametrosIbscbs } from './ibscbs.js';

export interface ServicoSaudeInput {
  ctribNac: string;
  cnbs?: string | null;
  tomadorCpf?: boolean;
  opcaoSimplesNacional?: 'nao_optante' | 'mei' | 'me_epp';
  beneficioReducaoSaude?: boolean;
}

/**
 * Identifica se a classificação do serviço corresponde a medicina humana
 * ou serviços de saúde no padrão nacional.
 */
export function ehServicoSaude(ctribNac: string, cnbs?: string | null): boolean {
  const nacLimpo = ctribNac.replace(/\D/g, '');
  if (nacLimpo.startsWith('0401')) return true;
  if (cnbs && cnbs.replace(/\D/g, '').startsWith('12205')) return true;
  return false;
}

/**
 * Sugere parâmetros de IBS/CBS para serviço de saúde com base no regime e
 * na redução de 60% prevista na Emenda Constitucional 132/2023.
 */
export function sugerirIbscbsSaude(input: ServicoSaudeInput): ParametrosIbscbs {
  const indFinal = input.tomadorCpf ? '1' : '0';
  const cIndOp = '100301'; // Prestação interna padrão no país
  const indDest = '0'; // Tomador identificado
  const finNFSe = '0'; // Regular

  if (input.opcaoSimplesNacional === 'mei') {
    return { finNFSe, indFinal, cIndOp, indDest, CST: '999', cClassTrib: '000001' };
  }

  // Redução constitucional de 60% para serviços de saúde (art. 9º § 1º II EC 132/23)
  if (input.beneficioReducaoSaude !== false) {
    return { finNFSe, indFinal, cIndOp, indDest, CST: '200', cClassTrib: '200001' };
  }

  // Tributação integral padrão
  return { finNFSe, indFinal, cIndOp, indDest, CST: '000', cClassTrib: '000001' };
}

/**
 * Ajusta o indicador de consumidor final na emissão de consultas médicas:
 * pacientes pessoas físicas (CPF) são sempre consumidores finais.
 */
export function ajustarIndFinalTomador(ibscbs: ParametrosIbscbs, tomadorCpf: boolean): ParametrosIbscbs {
  if (tomadorCpf && ibscbs.indFinal !== '1') {
    return { ...ibscbs, indFinal: '1' };
  }
  return ibscbs;
}
