/**
 * Testes unitários para o FiscalClient do Noto.
 * Valida comunicação HTTP via porta efêmera com token interno.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { FiscalClient } from './fiscal-client.js';

describe('FiscalClient em src/integracoes', () => {
  it('deve enviar requisição de salvar certificado e retornar dados do titular', async () => {
    const app = express();
    app.use(express.json());

    app.post('/v1/onboarding/certificado', (req, res) => {
      assert.equal(req.headers['x-internal-token'], 'token-fiscal-teste');
      res.json({
        sucesso: true,
        titular: {
          nome: 'CLINICA MEDICA TESTE',
          tipo: 'PJ',
          cnpj: '12345678000195',
          validadeAte: '2027-10-15T00:00:00.000Z'
        },
        parametrosFiscaisSugeridos: {
          regimeTributario: 'simples_nacional',
          optanteSimples: true,
          aliquotaIss: 2.01,
          codigoTributacaoNacional: '040101',
          descricaoServicoPadrao: 'Consulta',
          reformaTributaria: { cbsAliquota: 0, ibsAliquota: 0 }
        },
        referenciaAdnEncontrada: false
      });
    });

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      const client = new FiscalClient({
        baseUrl: `http://127.0.0.1:${porta}`,
        tokenInterno: 'token-fiscal-teste'
      });

      const res = await client.salvarCertificado({
        medicoId: 'med-1',
        arquivoBase64: 'dGVzdGU=',
        senha: '123'
      });

      assert.equal(res.sucesso, true);
      if (res.sucesso) {
        assert.equal(res.titular.cnpj, '12345678000195');
      }
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('deve emitir nota fiscal e retornar autorização', async () => {
    const app = express();
    app.use(express.json());

    app.post('/v1/notas/emitir', (req, res) => {
      assert.equal(req.headers['idempotency-key'], 'ped-100');
      res.json({
        sucesso: true,
        pedidoId: 'ped-100',
        status: 'autorizada',
        numeroNota: '100',
        chaveAcesso: 'chave-100',
        linkDanfsePdf: '/v1/notas/ped-100/pdf'
      });
    });

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      const client = new FiscalClient({
        baseUrl: `http://127.0.0.1:${porta}`,
        tokenInterno: 'token-fiscal-teste'
      });

      const res = await client.emitirNota({
        pedidoId: 'ped-100',
        medicoId: 'med-1',
        tomador: { cpfCnpj: '12345678901', nome: 'Paciente' },
        servico: { valorCentavos: 45000, dataCompetencia: '2026-10-15', discriminacao: 'Consulta' }
      });

      assert.equal(res.sucesso, true);
      if (res.sucesso) {
        assert.equal(res.numeroNota, '100');
        assert.equal(res.status, 'autorizada');
      }
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
