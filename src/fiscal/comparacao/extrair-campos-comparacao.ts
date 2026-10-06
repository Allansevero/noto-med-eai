/** Reduz XML e política a campos fiscais comparáveis, descartando paciente, valores e descrição. */
import type { CamposFiscais } from './tipos.js';
import { extrairSugestaoEmissao } from '../../onboarding/regras/extrair-sugestao-emissao.js';

export function camposDosParametros(parametros: Record<string, any>): CamposFiscais {
  const campos: CamposFiscais = {};
  for (const chave of ['opcaoSimplesNacional', 'regimeApuracaoSn', 'regimeEspecialTributacao', 'municipioPrestacao',
    'tribISSQN', 'tpRetISSQN', 'cstPisCofins', 'percentualTotTribSN', 'aliquotaIss']) {
    const valor = parametros[chave];
    if (typeof valor === 'string' || (typeof valor === 'number' && Number.isFinite(valor))) campos[chave] = valor;
  }
  for (const grupo of ['totalTributos', 'pisCofinsCalculo']) {
    for (const [chave, valor] of Object.entries(parametros[grupo] || {})) {
      if (typeof valor === 'string' || (typeof valor === 'number' && Number.isFinite(valor))) campos[`${grupo}.${chave}`] = valor;
    }
  }
  for (const chave of ['CST', 'cClassTrib', 'cIndOp', 'finNFSe', 'indFinal', 'indDest']) {
    const valor = parametros.ibscbs?.[chave];
    if (typeof valor === 'string') campos[`ibscbs.${chave}`] = valor;
  }
  return campos;
}

export function extrairCamposComparacao(xmlObj: any): CamposFiscais {
  const nfse = xmlObj.NFSe?.infNFSe ?? {};
  const dps = nfse.DPS?.infDPS ?? {};
  const campos = camposDosParametros(extrairSugestaoEmissao(xmlObj));
  const valor = (chave: string, dado: unknown) => { if (typeof dado === 'string' && dado.trim()) campos[chave] = dado.trim(); };
  valor('razaoSocial', nfse.emit?.xNome ?? dps.prest?.xNome);
  valor('municipioEmitente', dps.cLocEmi);
  valor('municipioIncidencia', nfse.cLocIncid);
  valor('ctribNac', dps.serv?.cServ?.cTribNac);
  valor('ctribMun', dps.serv?.cServ?.cTribMun);
  valor('cnbs', dps.serv?.cServ?.cNBS);
  if (String(dps.prest?.regTrib?.opSimpNac) === '1') campos.opcaoSimplesNacional = 'nao_optante';
  const aliquota = dps.valores?.trib?.tribMun?.pAliq;
  if (aliquota !== undefined && aliquota !== '' && Number.isFinite(Number(aliquota))) campos.aliquotaIss = Number(aliquota);
  // Mesmo um grupo ainda não suportado deve aparecer como referência, sem sugerir
  // que está disponível para emissão só porque os códigos foram extraídos.
  const ibs = dps.IBSCBS;
  if (ibs && !Array.isArray(ibs)) {
    for (const chave of ['finNFSe', 'indFinal', 'indDest', 'cIndOp']) valor(`ibscbs.${chave}`, ibs[chave]);
    for (const chave of ['CST', 'cClassTrib']) valor(`ibscbs.${chave}`, ibs.valores?.trib?.gIBSCBS?.[chave]);
  }
  return campos;
}
