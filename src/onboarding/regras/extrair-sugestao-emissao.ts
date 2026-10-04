/** Sugestão proveniente do documento: nunca recebe confirmação ou vigência implícita. */
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
  const opcao = ({ '2': 'mei', '3': 'me_epp' } as Record<string, string>)[String(reg.opSimpNac)];
  if (opcao) sugestao.opcaoSimplesNacional = opcao;
  if (reg.regApTribSN) sugestao.regimeApuracaoSn = `regime_${reg.regApTribSN}`;
  numero('regimeEspecialTributacao', reg.regEspTrib);
  numero('tribISSQN', trib.tribMun?.tribISSQN);
  numero('tpRetISSQN', trib.tribMun?.tpRetISSQN);
  if (trib.tribFed?.piscofins?.CST !== undefined) sugestao.cstPisCofins = String(trib.tribFed.piscofins.CST).padStart(2, '0');
  numero('percentualTotTribSN', trib.totTrib?.pTotTribSN);
  return sugestao;
}
