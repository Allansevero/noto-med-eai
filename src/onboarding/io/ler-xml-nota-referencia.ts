/**
 * Leitor e validador do arquivo XML da NFS-e de referência enviada pelo médico.
 * Faz parse namespace-aware (fast-xml-parser) e valida se pertence ao leiaute
 * da NFS-e Padrão Nacional (sped.fazenda.gov.br/nfse v1.01+), rejeitando formatos
 * municipais legados (ex.: ABRASF) com mensagem orientativa (seção 7 do plano).
 */

import { XMLParser } from 'fast-xml-parser';

export type ResultadoLeituraXml = {
  versao: string;
  xmlObj: any;
};

export function lerXmlNotaReferencia(xmlString: string): ResultadoLeituraXml {
  if (!xmlString || typeof xmlString !== 'string' || xmlString.trim().length === 0) {
    throw new Error('Conteúdo do XML não pode ser vazio.');
  }

  // Detecta se é o padrão municipal antigo ABRASF antes de tentar o padrão nacional
  if (xmlString.includes('<tcInfNfse') || xmlString.includes('<CompNfse') || xmlString.includes('nfse.abrasf.org.br')) {
    throw new Error(
      'O XML enviado é do padrão municipal legado (ABRASF). ' +
      'Para o Notomed, envie o XML emitido no Padrão Nacional da NFS-e (sped.fazenda.gov.br/nfse).'
    );
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
    trimValues: true
  });

  let parsed: any;
  try {
    parsed = parser.parse(xmlString);
  } catch (err) {
    throw new Error('Arquivo XML inválido ou mal formatado.');
  }

  const raiz = parsed.NFSe || parsed.compNFSe || parsed.nfse || parsed.DPS || parsed;
  const infNfse = raiz.infNFSe || raiz;
  const infDps = infNfse.DPS?.infDPS || infNfse.infDPS || raiz.infDPS || raiz;

  const versao = infNfse['@_versao'] || infDps['@_versao'] || '1.01';

  if (!infNfse.emit && !infDps.prest) {
    throw new Error('O XML não contém grupo de emissor/prestador válido do Padrão Nacional de NFS-e.');
  }

  return {
    versao: String(versao),
    xmlObj: parsed
  };
}
