/**
 * Extração pura de chaves privadas e certificados X509 de arquivos PKCS#12 (.p12/.pfx).
 * Permite assinar digitalmente a DPS (XMLDSig) e autenticar requisições mTLS
 * sem depender de ferramentas CLI locais nem de binários nativos de C++.
 */

import forge from 'node-forge';

export interface ChavesCertificado {
  pemKey: string;
  pemCert: string;
  certBase64: string;
  serialNumber?: string;
  validoDe?: Date;
  validoAte?: Date;
}

export function extrairChavesCertificado(pfxBuffer: Buffer, senha: string): ChavesCertificado {
  if (!pfxBuffer || pfxBuffer.length === 0) {
    throw new Error('Buffer do certificado A1 está vazio.');
  }

  const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, senha);

  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });

  const keyObj = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0]?.key;
  const certObj = certBags[forge.pki.oids.certBag]?.[0]?.cert;

  if (!keyObj) {
    throw new Error('Chave privada não encontrada no arquivo PKCS#12.');
  }
  if (!certObj) {
    throw new Error('Certificado X509 não encontrado no arquivo PKCS#12.');
  }

  const pemKey = forge.pki.privateKeyToPem(keyObj);
  const pemCert = forge.pki.certificateToPem(certObj);
  const certAsn1 = forge.pki.certificateToAsn1(certObj);
  const certDer = forge.asn1.toDer(certAsn1).getBytes();
  const certBase64 = Buffer.from(certDer, 'binary').toString('base64');

  return {
    pemKey,
    pemCert,
    certBase64,
    serialNumber: certObj.serialNumber,
    validoDe: certObj.validity?.notBefore,
    validoAte: certObj.validity?.notAfter
  };
}
