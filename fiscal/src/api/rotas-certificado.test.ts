/**
 * Testes unitários para rota de upload do certificado digital A1.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import forge from 'node-forge';
import { criarRouterCertificado } from './rotas-certificado.js';

describe('Router de Certificado A1 em /fiscal', () => {
  it('deve extrair titular e parâmetros com sucesso para certificado A1 válido', async () => {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 1);
    cert.setSubject([{ name: 'commonName', value: 'CLINICA DR TESTE LTDA:12345678000195' }]);
    cert.setIssuer(cert.subject.attributes);
    cert.sign(keys.privateKey, forge.md.sha256.create());

    const senha = 'senha-123';
    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha);
    const p12Der = forge.asn1.toDer(p12Asn1).getBytes();
    const arquivoBase64 = Buffer.from(p12Der, 'binary').toString('base64');

    let salvou = false;
    const repositorioFake = {
      async salvarCertificadoCriptografado() {
        salvou = true;
      }
    };

    const app = express();
    app.use(express.json());
    app.use('/v1', criarRouterCertificado(repositorioFake));

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      const resp = await fetch(`http://127.0.0.1:${porta}/v1/onboarding/certificado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicoId: 'med-123',
          arquivoBase64,
          senha
        })
      });

      const body = await resp.json() as any;

      assert.equal(resp.status, 200);
      assert.equal(body.sucesso, true);
      assert.equal(body.titular.cnpj, '12345678000195');
      assert.equal(body.titular.tipo, 'PJ');
      assert.equal(body.parametrosFiscaisSugeridos.codigoTributacaoNacional, '040101');
      assert.equal(salvou, true);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('deve rejeitar requisição sem senha', async () => {
    const app = express();
    app.use(express.json());
    app.use('/v1', criarRouterCertificado());

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      const resp = await fetch(`http://127.0.0.1:${porta}/v1/onboarding/certificado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ medicoId: 'med-123', arquivoBase64: 'abc' })
      });

      assert.equal(resp.status, 400);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
