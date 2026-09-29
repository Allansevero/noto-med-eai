import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import forge from 'node-forge';
import { extrairChavesCertificado } from './extrair-chaves-certificado.js';

describe('extrairChavesCertificado', () => {
  it('deve extrair pemKey, pemCert e certBase64 de um PKCS#12 válido', () => {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    cert.setSubject([
      { name: 'organizationalUnitName', value: 'ENTIDADE CERTIFICADORA:11222333000181' },
      { name: 'commonName', value: 'CLINICA MEDICA LTDA:12345678000195' }
    ]);
    cert.setIssuer([{ name: 'commonName', value: 'CLINICA MEDICA LTDA:12345678000195' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const senha = 'senha-teste-123';
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha);
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const pfxBuffer = Buffer.from(p12Der, 'binary');

    const chaves = extrairChavesCertificado(pfxBuffer, senha);

    assert.ok(chaves.pemKey.includes('-----BEGIN RSA PRIVATE KEY-----'));
    assert.ok(chaves.pemCert.includes('-----BEGIN CERTIFICATE-----'));
    assert.ok(chaves.certBase64.length > 100);
    assert.equal(chaves.serialNumber, '01');
    assert.ok(chaves.validoAte instanceof Date);
    assert.equal(chaves.documentoTitular, '12345678000195');
  });

  it('deve lançar erro quando buffer for vazio', () => {
    assert.throws(
      () => extrairChavesCertificado(Buffer.alloc(0), '1234'),
      /Buffer do certificado A1 está vazio/
    );
  });

  it('deve selecionar o certificado que corresponde à chave privada em uma cadeia', () => {
    const titularKeys = forge.pki.rsa.generateKeyPair(1024);
    const caKeys = forge.pki.rsa.generateKeyPair(1024);

    const ca = forge.pki.createCertificate();
    ca.publicKey = caKeys.publicKey;
    ca.serialNumber = '10';
    ca.validity.notBefore = new Date();
    ca.validity.notAfter = new Date(Date.now() + 86400000);
    ca.setSubject([{ name: 'commonName', value: 'AUTORIDADE TESTE:11222333000181' }]);
    ca.setIssuer(ca.subject.attributes);
    ca.setExtensions([{ name: 'basicConstraints', cA: true }]);
    ca.sign(caKeys.privateKey, forge.md.sha256.create());

    const titular = forge.pki.createCertificate();
    titular.publicKey = titularKeys.publicKey;
    titular.serialNumber = '11';
    titular.validity.notBefore = new Date();
    titular.validity.notAfter = new Date(Date.now() + 86400000);
    titular.setSubject([{ name: 'commonName', value: 'CLINICA TITULAR:12345678000195' }]);
    titular.setIssuer(ca.subject.attributes);
    titular.sign(caKeys.privateKey, forge.md.sha256.create());

    const senha = 'senha-cadeia';
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(titularKeys.privateKey, [ca, titular], senha);
    const pfxBuffer = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');

    const chaves = extrairChavesCertificado(pfxBuffer, senha);
    assert.equal(chaves.serialNumber, '11');
    assert.equal(chaves.documentoTitular, '12345678000195');
  });

  it('deve lançar erro quando senha for incorreta', () => {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '02';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.setSubject([{ name: 'commonName', value: 'TESTE' }]);
    cert.setIssuer([{ name: 'commonName', value: 'TESTE' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'correta');
    const pfxBuffer = Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');

    assert.throws(
      () => extrairChavesCertificado(pfxBuffer, 'errada')
    );
  });
});
