/**
 * Extrai parâmetros fiscais duradouros do médico a partir do XML parseado
 * da NFS-e Nacional (leiaute sped.fazenda.gov.br/nfse 1.01+).
 * Função 100% pura: nunca toca banco ou rede (seção 3 e 4 do plano).
 */

import { inferirUfDeMunicipioIbge } from './inferir-uf-de-municipio-ibge.js';

export type ParametrosFiscaisExtraidos = {
  cnpj: string;
  inscricaoMunicipal: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  codMunicipioIbge: string;
  uf: string;
  serieDps: string;
  opcaoSimplesNacional: 'nao_optante' | 'mei' | 'me_epp';
  regimeApuracaoSn: 'regime_1' | 'regime_2' | 'regime_3' | null;
  regimeEspecialTributacao: number;
  ambiente: 'producao' | 'homologacao';
  cnae: string | null;
  proximoNumeroSequencialSugerido: number;
  cclassTribPadrao: string | null;
  cindOpPadrao: string | null;
  dadosReformaTributaria: Record<string, unknown>;
};

function extrairNosPrincipais(xmlObj: any): { infNfse: any; infDps: any } {
  const raiz = xmlObj.NFSe || xmlObj.compNFSe || xmlObj.nfse || xmlObj;
  const infNfse = raiz.infNFSe || raiz;
  const infDps = infNfse.DPS?.infDPS || infNfse.infDPS || raiz.DPS?.infDPS || raiz.infDPS || {};
  return { infNfse, infDps };
}

function mapearOpcaoSimples(val?: string | number): 'nao_optante' | 'mei' | 'me_epp' {
  const s = String(val ?? '3');
  if (s === '1') return 'nao_optante';
  if (s === '2') return 'mei';
  return 'me_epp';
}

function mapearRegimeApuracao(val?: string | number): 'regime_1' | 'regime_2' | 'regime_3' | null {
  if (!val) return null;
  const s = String(val);
  if (s === '1') return 'regime_1';
  if (s === '2') return 'regime_2';
  if (s === '3') return 'regime_3';
  return null;
}

export function mapearParametrosFiscaisDoXml(xmlObj: any): ParametrosFiscaisExtraidos {
  const { infNfse, infDps } = extrairNosPrincipais(xmlObj);
  const emit = infNfse.emit || {};
  const prest = infDps.prest || {};
  const regTrib = prest.regTrib || {};
  const cServ = infDps.serv?.cServ || {};

  const cnpj = String(emit.CNPJ || prest.CNPJ || emit.CPF || prest.CPF || '').replace(/\D/g, '');
  if (!cnpj) throw new Error('XML não contém CNPJ/CPF do prestador emitente.');

  const im = String(emit.IM || prest.IM || '').trim();
  const razaoSocial = String(emit.xNome || prest.xNome || '').trim();
  const nomeFantasia = emit.xFant ? String(emit.xFant).trim() : null;

  const codMunicipioIbge = String(infDps.cLocEmi || infNfse.cLocIncid || '').trim();
  const uf = emit.enderNac?.UF || inferirUfDeMunicipioIbge(codMunicipioIbge) || 'RS';

  const serieDps = String(infDps.serie || '00001').trim();
  const nDpsNum = Number(infDps.nDPS || infNfse.nNFSe || infNfse.nDFSe || 0);
  const proximoNumeroSequencialSugerido = nDpsNum > 0 ? nDpsNum + 1 : 1;

  const tpAmb = String(infDps.tpAmb || infNfse.ambGer || '1');
  const ambiente = tpAmb === '1' ? 'producao' : 'homologacao';

  const gIbscbs = infDps.gIBSCBS || infDps.valores?.gIBSCBS || {};

  return {
    cnpj,
    inscricaoMunicipal: im,
    razaoSocial,
    nomeFantasia,
    codMunicipioIbge,
    uf,
    serieDps,
    opcaoSimplesNacional: mapearOpcaoSimples(regTrib.opSimpNac),
    regimeApuracaoSn: mapearRegimeApuracao(regTrib.regApTribSN),
    regimeEspecialTributacao: Number(regTrib.regEspTrib ?? 0),
    ambiente,
    cnae: cServ.cIntContrib ? String(cServ.cIntContrib).trim() : null,
    proximoNumeroSequencialSugerido,
    cclassTribPadrao: gIbscbs.cClassTrib ? String(gIbscbs.cClassTrib) : null,
    cindOpPadrao: gIbscbs.cIndOp ? String(gIbscbs.cIndOp) : null,
    dadosReformaTributaria: gIbscbs.CST ? { cst: gIbscbs.CST, cClassTrib: gIbscbs.cClassTrib } : {}
  };
}
