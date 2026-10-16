/**
 * Testes de integração da aplicação do serviço /fiscal.
 * Valida healthcheck e proteção das rotas /v1 com token interno.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { criarAppFiscal } from './app.js';

describe('Serviço Fiscal - Aplicação HTTP', () => {
  it('deve responder 200 OK no endpoint /health sem necessidade de token', async () => {
    const app = criarAppFiscal({
      porta: 0,
      tokenInterno: 'token-teste',
      chaveCriptografiaCertificado: 'chave-teste'
    });

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      const resp = await fetch(`http://127.0.0.1:${porta}/health`);
      const body = await resp.json() as any;

      assert.equal(resp.status, 200);
      assert.equal(body.servico, 'fiscal');
      assert.equal(body.status, 'ok');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('deve rejeitar acesso a /v1 sem token e aceitar com token interno válido', async () => {
    const app = criarAppFiscal({
      porta: 0,
      tokenInterno: 'token-secreto-fiscal',
      chaveCriptografiaCertificado: 'chave-teste'
    });

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      // 1. Sem token -> 401
      const respBloqueada = await fetch(`http://127.0.0.1:${porta}/v1/parametros-fiscais/med-1`);
      assert.equal(respBloqueada.status, 401);

      // 2. Com token correto -> 200
      const respAutorizada = await fetch(`http://127.0.0.1:${porta}/v1/parametros-fiscais/med-1`, {
        headers: {
          'X-Internal-Token': 'token-secreto-fiscal'
        }
      });
      assert.equal(respAutorizada.status, 200);
      const body = await respAutorizada.json() as any;
      assert.equal(body.sucesso, true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
