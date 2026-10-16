/**
 * Testes unitários para consulta e atualização de parâmetros fiscais em /fiscal.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarRouterParametros } from './rotas-parametros.js';

describe('Router de Parâmetros Fiscais em /fiscal', () => {
  it('deve retornar parâmetros consolidados em GET', async () => {
    const app = express();
    app.use(express.json());
    app.use('/v1', criarRouterParametros());

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      const resp = await fetch(`http://127.0.0.1:${porta}/v1/parametros-fiscais/med-1`);
      const body = await resp.json() as any;

      assert.equal(resp.status, 200);
      assert.equal(body.sucesso, true);
      assert.equal(body.parametros.codigoTributacaoNacional, '040101');
      assert.equal(body.parametros.aliquotaIss, 2.01);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
