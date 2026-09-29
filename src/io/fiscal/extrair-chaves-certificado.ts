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
  documentoTitular?: string;
}

function validarDocumento(documento: string): boolean {
  if (/^(\d)\1+$/.test(documento)) return false;
  const numeros = documento.split('').map(Number);

  if (documento.length === 11) {
    const calcular = (quantidade: number) => {
      const soma = numeros.slice(0, quantidade).reduce((total, numero, indice) =>
        total + numero * (quantidade + 1 - indice), 0);
      const resto = (soma * 10) % 11;
      return resto === 10 ? 0 : resto;
    };
    return calcular(9) === numeros[9] && calcular(10) === numeros[10];
  }

  if (documento.length === 14) {
    const calcular = (quantidade: 12 | 13) => {
      const pesos = quantidade === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
      const soma = numeros.slice(0, quantidade).reduce((total, numero, indice) =>
        total + numero * pesos[indice], 0);
      const resto = soma % 11;
      return resto < 2 ? 0 : 11 - resto;
    };
    return calcular(12) === numeros[12] && calcular(13) === numeros[13];
  }

  return false;
}

function extrairDocumentoDosTextos(textos: string[]): string | undefined {
  for (const texto of textos) {
    const candidatos = String(texto)
      .match(/(?<!\d)(?:\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2})(?!\d)/g)
      ?.map((valor) => valor.replace(/\D/g, '')) || [];
    const valido = candidatos.find(validarDocumento);
    if (valido) return valido;
  }
  return undefined;
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
  const textosIdentificacao = certObj.subject.attributes.map((atributo) => String(atributo.value || ''));

  return {
    pemKey,
    pemCert,
    certBase64,
    serialNumber: certObj.serialNumber,
    validoDe: certObj.validity?.notBefore,
    validoAte: certObj.validity?.notAfter,
    documentoTitular: extrairDocumentoDosTextos(textosIdentificacao)
  };
}
