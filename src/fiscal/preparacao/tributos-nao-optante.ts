/** Montantes novos vêm do valor da nova consulta; não são copiados da referência. */
import { parametrosEmissaoSchema, type ParametrosEmissao } from './parametros-emissao.js';
export function tributosNaoOptante(parametros: ParametrosEmissao, valorServico: number, tomadorCpf = false) {
  const { competencia: _competencia, ...politica } = parametros as ParametrosEmissao & { competencia?: string };
  const p = parametrosEmissaoSchema.parse(politica);
  if (p.opcaoSimplesNacional !== 'nao_optante' || !Number.isFinite(valorServico) || valorServico <= 0 || Math.round(valorServico * 100) / 100 !== valorServico) {
    throw new Error('Regime ou valor inválido para calcular os tributos da consulta.');
  }
  const calc = p.pisCofinsCalculo;
  const monetario = (taxa: number) => (Math.round(Math.round(valorServico * 100) * Math.round(taxa * 100) / 10000) / 100).toFixed(2);
  const tpRetISSQN = tomadorCpf ? 1 : p.tpRetISSQN;
  return {
    tribMun: { tribISSQN: p.tribISSQN, tpRetISSQN,
      ...(p.aliquotaIss !== undefined ? { pAliq: p.aliquotaIss.toFixed(2) } : {}) },
    ...(p.cstPisCofins ? { tribFed: { piscofins: { CST: p.cstPisCofins,
      ...(calc ? { vBCPisCofins: valorServico.toFixed(2), pAliqPis: calc.aliquotaPis.toFixed(2),
        pAliqCofins: calc.aliquotaCofins.toFixed(2), vPis: monetario(calc.aliquotaPis), vCofins: monetario(calc.aliquotaCofins),
        ...(calc.tipoRetencao !== undefined ? { tpRetPisCofins: calc.tipoRetencao } : {}) } : {}) } } } : {}),
    totTrib: p.totalTributos!.tipo === 'nao_informado' ? { indTotTrib: 0 } : {
      pTotTrib: { pTotTribFed: p.totalTributos!.federal.toFixed(2), pTotTribEst: p.totalTributos!.estadual.toFixed(2),
        pTotTribMun: p.totalTributos!.municipal.toFixed(2) } }
  };
}
/** Chaves são as do layout conhecido; não recebe fragmentos XML da referência. */
export function xmlTributosNaoOptante(parametros: ParametrosEmissao, valorServico: number, tomadorCpf = false): string {
  const serializar = (grupo: Record<string, unknown>): string => Object.entries(grupo).map(([chave, valor]) =>
    `<${chave}>${typeof valor === 'object' && valor !== null ? serializar(valor as Record<string, unknown>) : valor}</${chave}>`).join('');
  return serializar(tributosNaoOptante(parametros, valorServico, tomadorCpf));
}
