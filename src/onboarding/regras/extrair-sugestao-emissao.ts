/** Sugestão proveniente do documento: nunca recebe confirmação ou vigência implícita. */
import { extrairIbscbsReferencia } from './extrair-ibscbs-referencia.js';
export function extrairSugestaoEmissao(xmlObj: any): Record<string, unknown> {
  const raiz = xmlObj.NFSe || xmlObj.compNFSe || xmlObj.nfse || xmlObj;
  const nfse = raiz.infNFSe || raiz;
  const dps = nfse.DPS?.infDPS || nfse.infDPS || raiz.DPS?.infDPS || raiz.infDPS || {};
  const trib = dps.valores?.trib || {};
  const reg = dps.prest?.regTrib || {};
  const sugestao: Record<string, unknown> = {};
  if (String(dps.tpAmb) === '1') sugestao.ambiente = 'producao';
  if (String(dps.tpAmb) === '2') sugestao.ambiente = 'homologacao';
  const numero = (chave: string, valor: unknown) => { if (valor !== undefined && valor !== null && valor !== '') sugestao[chave] = Number(valor); };
  if (dps.serv?.locPrest?.cLocPrestacao) sugestao.municipioPrestacao = String(dps.serv.locPrest.cLocPrestacao);
  const opcao = ({ '1': 'nao_optante', '2': 'mei', '3': 'me_epp' } as Record<string, string>)[String(reg.opSimpNac)];
  if (opcao) sugestao.opcaoSimplesNacional = opcao;
  if (reg.regApTribSN) sugestao.regimeApuracaoSn = `regime_${reg.regApTribSN}`;
  numero('regimeEspecialTributacao', reg.regEspTrib);
  numero('tribISSQN', trib.tribMun?.tribISSQN);
  numero('tpRetISSQN', trib.tribMun?.tpRetISSQN);
  if (trib.tribFed?.piscofins?.CST !== undefined) sugestao.cstPisCofins = String(trib.tribFed.piscofins.CST).padStart(2, '0');
  numero('percentualTotTribSN', trib.totTrib?.pTotTribSN);
  const decimal = (v: unknown) => /^\d+(?:\.\d{1,2})?$/.test(String(v)) ? Number(v) : NaN;
  if (trib.tribMun?.pAliq !== undefined && (opcao === 'nao_optante' || reg.regApTribSN === 2 || String(trib.tribMun?.tpRetISSQN) === '2')) {
    sugestao.aliquotaIss = decimal(trib.tribMun.pAliq);
  }
  if (opcao === 'nao_optante') {
    const total = trib.totTrib;
    if (String(total?.indTotTrib) === '0') sugestao.totalTributos = { tipo: 'nao_informado' };
    if (total?.pTotTrib) sugestao.totalTributos = { tipo: 'percentual', federal: decimal(total.pTotTrib.pTotTribFed),
      estadual: decimal(total.pTotTrib.pTotTribEst), municipal: decimal(total.pTotTrib.pTotTribMun) };
    const pis = trib.tribFed?.piscofins;
    if (['01', '02'].includes(String(pis?.CST).padStart(2, '0'))) {
      sugestao.pisCofinsCalculo = { base: 'valor_servico', aliquotaPis: decimal(pis.pAliqPis), aliquotaCofins: decimal(pis.pAliqCofins),
        ...(pis.tpRetPisCofins !== undefined ? { tipoRetencao: decimal(pis.tpRetPisCofins) } : {}) };
    }
  }
  const ibscbs = extrairIbscbsReferencia(dps);
  if (ibscbs.parametros) sugestao.ibscbs = ibscbs.parametros;
  return sugestao;
}
