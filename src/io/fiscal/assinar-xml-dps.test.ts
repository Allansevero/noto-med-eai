import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import forge from 'node-forge';
import { assinarXmlDps } from './assinar-xml-dps.js';
import { extrairChavesCertificado } from './extrair-chaves-certificado.js';

describe('assinarXmlDps', () => {
  it('deve assinar digitalmente a tag infDPS e adicionar Signature com X509Certificate', () => {
    // 1. Gera chaves e p12 temporário
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    cert.setSubject([{ name: 'commonName', value: 'TESTE' }]);
    cert.setIssuer([{ name: 'commonName', value: 'TESTE' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], '1234');
    const pfxBuffer = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
    const chaves = extrairChavesCertificado(pfxBuffer, '1234');

    // 2. XML simples com infDPS
    const dpsId = 'DPS1355030821234567800019500001000000000000001';
    const xml = `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infDPS Id="${dpsId}"><tpAmb>1</tpAmb><nDPS>1</nDPS></infDPS></DPS>`;

    // 3. Assina
    const signedXml = assinarXmlDps({
      xml,
      dpsId,
      pemKey: chaves.pemKey,
      pemCert: chaves.pemCert,
      certBase64: chaves.certBase64
    });

    assert.ok(signedXml.includes('<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">'));
    assert.ok(signedXml.includes(`URI="#${dpsId}"`));
    assert.ok(signedXml.includes('<DigestValue>'));
    assert.ok(signedXml.includes('<SignatureValue>'));
    assert.ok(signedXml.includes('<X509Certificate>'));
    assert.ok(signedXml.includes(chaves.certBase64));
  });

  it('deve lançar erro se faltar parâmetro obrigatório', () => {
    assert.throws(
      () => assinarXmlDps({
        xml: '',
        dpsId: '123',
        pemKey: 'key',
        pemCert: 'cert',
        certBase64: 'b64'
      }),
      /Parâmetros obrigatórios ausentes/
    );
  });
});
