/**
 * Assinatura digital pura da DPS (XMLDSig) com Certificado Digital A1 ICP-Brasil.
 * Realiza a assinatura enveloped RSA-SHA256 e canonicalização C14N da tag <infDPS>,
 * anexando o nó <Signature> conforme exigido pelo Convênio Nacional da NFS-e.
 */

import { SignedXml } from 'xml-crypto';

export interface AssinarXmlDpsParams {
  xml: string;
  dpsId: string;
  pemKey: string;
  pemCert: string;
  certBase64: string;
}

export function assinarXmlDps(params: AssinarXmlDpsParams): string {
  const { xml, dpsId, pemKey, pemCert, certBase64 } = params;

  if (!xml || !dpsId || !pemKey || !certBase64) {
    throw new Error('Parâmetros obrigatórios ausentes para assinatura digital da DPS.');
  }

  const cleanB64 = certBase64.replace(/\s+/g, '');

  const sig = new SignedXml({
    privateKey: pemKey,
    publicCert: pemCert,
    signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
    canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#',
    getKeyInfoContent: () => `<X509Data><X509Certificate>${cleanB64}</X509Certificate></X509Data>`
  });

  sig.addReference({
    xpath: `//*[local-name(.)='infDPS' and @Id='${dpsId}']`,
    digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: [
      'http://www.w3.org/2000/09/xmldsig#enveloped-signature',
      'http://www.w3.org/2001/10/xml-exc-c14n#'
    ],
  });

  sig.computeSignature(xml, {
    location: { reference: "//*[local-name(.)='infDPS']", action: 'after' }
  });

  return sig.getSignedXml();
}
