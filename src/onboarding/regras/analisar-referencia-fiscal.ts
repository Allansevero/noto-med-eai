/**
 * Registra a origem e os limites do que pode ser reaproveitado. Campos operacionais
 * da nota anterior nunca viram impostos fixos ou dados de um próximo paciente.
 */
import { extrairIbscbsReferencia } from './extrair-ibscbs-referencia.js';
import { extrairSugestaoEmissao } from './extrair-sugestao-emissao.js';

export function analisarReferenciaFiscal(xmlObj: any) {
  const nfse = xmlObj.NFSe?.infNFSe || xmlObj.compNFSe?.infNFSe || xmlObj.nfse?.infNFSe || {};
  const dps = nfse.DPS?.infDPS || {};
  const ibscbs = extrairIbscbsReferencia(dps);
  const pendencias = [...ibscbs.pendencias];
  const detectar = (obj: any, conhecidos: string[], caminho: string) => {
    if (!obj || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { pendencias.push(`${caminho}: múltiplos grupos não suportados.`); return; }
    for (const chave of Object.keys(obj)) if (!chave.startsWith('@_') && !conhecidos.includes(chave)) {
      pendencias.push(`${caminho}/${chave}: precisa de tratamento específico antes de reutilizar a referência.`);
    }
  };
  if (!nfse.DPS?.infDPS) pendencias.push('A nota de referência precisa conter a DPS original do padrão nacional.');
  if (String(dps.tpEmit) !== '1') pendencias.push('A referência precisa ser uma emissão pelo próprio prestador.');
  if (!ibscbs.presente && (nfse.IBSCBS || nfse.IBSCBSSEL)) pendencias.push('Há IBS/CBS calculado, mas faltam os parâmetros declarados na DPS.');
  detectar(dps, ['tpAmb','dhEmi','verAplic','serie','nDPS','dCompet','tpEmit','cLocEmi','prest','toma','serv','valores','IBSCBS'], 'DPS');
  detectar(dps.prest?.regTrib, ['opSimpNac','regApTribSN','regEspTrib'], 'prest/regTrib');
  detectar(dps.serv?.cServ, ['cTribNac','cTribMun','cNBS','xDescServ'], 'serv/cServ');
  detectar(dps.serv, ['locPrest','cServ','infoCompl'], 'serv');
  detectar(dps.serv?.locPrest, ['cLocPrestacao'], 'serv/locPrest');
  detectar(dps.valores, ['vServPrest','trib'], 'valores');
  detectar(dps.valores?.vServPrest, ['vServ'], 'valores/vServPrest');
  const trib = dps.valores?.trib;
  detectar(trib, ['tribMun','tribFed','totTrib'], 'valores/trib');
  detectar(trib?.tribMun, ['tribISSQN','tpRetISSQN'], 'tribMun');
  detectar(trib?.tribFed, ['piscofins'], 'tribFed');
  detectar(trib?.tribFed?.piscofins, ['CST'], 'tribFed/piscofins');
  detectar(trib?.totTrib, ['pTotTribSN','indTotTrib'], 'totTrib');
  if (String(dps.prest?.regTrib?.opSimpNac) === '3' && trib?.totTrib?.indTotTrib !== undefined) {
    pendencias.push('A forma de totalização da referência para ME/EPP ainda não é suportada.');
  }
  if (String(dps.prest?.regTrib?.opSimpNac) === '1') pendencias.push('A emissão para não optante pelo Simples ainda precisa de suporte adicional.');
  if (String(dps.prest?.regTrib?.opSimpNac) === '2' && String(trib?.totTrib?.indTotTrib) !== '0') {
    pendencias.push('Confirmar suporte à forma de totalização dos tributos do MEI.');
  }
  const cServ = dps.serv?.cServ || {};
  const servico = { ctribNac: String(cServ.cTribNac || '').padStart(6, '0'),
    ctribMun: cServ.cTribMun ? String(cServ.cTribMun).padStart(3, '0') : null, cnbs: cServ.cNBS ? String(cServ.cNBS) : null };
  return { versao: 2 as const, servico, numero: String(nfse.nNFSe || nfse.nDFSe || ''),
    emitidaEm: String(dps.dhEmi || ''), competencia: String(dps.dCompet || ''),
    layout: String(xmlObj.NFSe?.['@_versao'] || nfse.DPS?.['@_versao'] || ''),
    ibscbsPresente: ibscbs.presente, parametrosSugeridos: extrairSugestaoEmissao(xmlObj), pendencias };
}
