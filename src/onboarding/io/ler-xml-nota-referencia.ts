/** Leitura das versões nacionais conhecidas; não converte XML nem infere tributos. */
import { XMLParser, XMLValidator } from 'fast-xml-parser';

export type ResultadoLeituraXml = { versao: string; xmlObj: any };
type DiagnosticoLayout = {
  namespaceNacional: boolean;
  versaoNfse: string | null;
  versaoDps: string | null;
  dpsPresente: boolean;
};
export class ErroXmlReferencia extends Error {
  constructor(public readonly codigo: string, mensagem: string,
    public readonly diagnostico?: DiagnosticoLayout) {
    super(mensagem);
    this.name = 'ErroXmlReferencia';
  }
}
const namespaceNacional = 'http://www.sped.fazenda.gov.br/nfse';
const versoesConhecidas = new Set(['1.00', '1.01']);
const versaoSegura = (valor: unknown): string | null => valor === undefined ? null
  : /^\d{1,3}\.\d{1,3}$/.test(String(valor)) ? String(valor) : 'invalida';

export function lerXmlNotaReferencia(xmlString: string): ResultadoLeituraXml {
  if (!xmlString || typeof xmlString !== 'string' || !xmlString.trim()) {
    throw new ErroXmlReferencia('XML_VAZIO', 'Conteúdo do XML não pode ser vazio.');
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xmlString) || XMLValidator.validate(xmlString) !== true) {
    throw new ErroXmlReferencia('XML_INVALIDO', 'A nota retornada contém XML inválido ou mal formatado.');
  }
  if (xmlString.includes('<tcInfNfse') || xmlString.includes('<CompNfse') || xmlString.includes('nfse.abrasf.org.br')) {
    throw new ErroXmlReferencia('LAYOUT_MUNICIPAL', 'A nota localizada está no padrão municipal legado (ABRASF). A busca nesse sistema de origem precisa de integração específica.');
  }
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_',
    removeNSPrefix: true, parseTagValue: false, trimValues: true });
  const parsed = parser.parse(xmlString);
  const comNamespace = new XMLParser({ ignoreAttributes: false, parseTagValue: false }).parse(xmlString);
  const chaveRaiz = Object.keys(comNamespace).find(chave => /^(?:[\w.-]+:)?NFSe$/.test(chave));
  const prefixo = chaveRaiz?.includes(':') ? `:${chaveRaiz.split(':')[0]}` : '';
  const namespace = chaveRaiz ? comNamespace[chaveRaiz]?.[`@_xmlns${prefixo}`] : undefined;
  const raiz = parsed.NFSe;
  const infNfse = raiz?.infNFSe;
  const dps = infNfse?.DPS;
  const versao = raiz?.['@_versao'] ?? infNfse?.['@_versao'];
  const versaoDps = dps?.['@_versao'] ?? dps?.infDPS?.['@_versao'];
  const diagnostico: DiagnosticoLayout = { namespaceNacional: namespace === namespaceNacional,
    versaoNfse: versaoSegura(versao), versaoDps: versaoSegura(versaoDps),
    dpsPresente: Boolean(dps?.infDPS && typeof dps.infDPS === 'object' && !Array.isArray(dps.infDPS)) };
  if (!raiz || Array.isArray(raiz) || !infNfse || Array.isArray(infNfse) || !diagnostico.namespaceNacional) {
    throw new ErroXmlReferencia('LAYOUT_NAO_SUPORTADO', 'A nota localizada não corresponde ao formato nacional reconhecido. A equipe precisa verificar o sistema de origem.', diagnostico);
  }
  if (!versoesConhecidas.has(String(versao)) || (versaoDps !== undefined && !versoesConhecidas.has(String(versaoDps)))) {
    throw new ErroXmlReferencia('VERSAO_NAO_SUPORTADA', 'A nota localizada usa uma versão de XML ainda não reconhecida pelo Noto. A configuração permanece pendente para análise.', diagnostico);
  }
  if (!diagnostico.dpsPresente || Array.isArray(dps)) {
    throw new ErroXmlReferencia('DPS_AUSENTE', 'A nota foi localizada, mas não contém a declaração original necessária para extrair os parâmetros tributários. A configuração permanece pendente.', diagnostico);
  }
  if (!infNfse.emit && !dps.infDPS.prest) {
    throw new ErroXmlReferencia('EMITENTE_AUSENTE', 'A nota localizada não contém um grupo de emissor ou prestador reconhecido.', diagnostico);
  }
  return { versao: String(versao), xmlObj: parsed };
}
