/**
 * Testes unitários para extração de chaves do certificado digital A1.
 * Valida extração de PEM, certificado X509, detecção de CPF/CNPJ e validação de senha.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import forge from 'node-forge';
import { extrairChavesCertificado } from './extrair-chaves-certificado.js';

describe('extrairChavesCertificado no serviço /fiscal', () => {
  it('deve extrair pemKey, pemCert e dados do titular de um PKCS#12 válido', () => {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    cert.setSubject([
      { name: 'commonName', value: 'CLINICA MEDICA DR SILVA LTDA:12345678000195' }
    ]);
    cert.setIssuer(cert.subject.attributes);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const senha = 'senha-teste-123';
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha);
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const pfxBuffer = Buffer.from(p12Der, 'binary');

    const chaves = extrairChavesCertificado(pfxBuffer, senha);

    assert.ok(chaves.pemKey.includes('-----BEGIN RSA PRIVATE KEY-----'));
    assert.ok(chaves.pemCert.includes('-----BEGIN CERTIFICATE-----'));
    assert.equal(chaves.documentoTitular, '12345678000195');
    assert.equal(chaves.nomeTitular, 'CLINICA MEDICA DR SILVA LTDA');
  });

  it('deve rejeitar buffer vazio com erro descritivo', () => {
    assert.throws(
      () => extrairChavesCertificado(Buffer.alloc(0), '1234'),
      /Buffer do certificado A1 está vazio/
    );
  });
});
