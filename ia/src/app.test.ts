/**
 * Testes de integração do servidor HTTP do serviço /ia.
 * Valida o healthcheck público e a proteção por token interno nas rotas de análise.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { criarAppIa } from './app.js';

describe('Serviço de IA - Aplicação HTTP', () => {
  it('deve responder 200 OK no endpoint /health sem token', async () => {
    const app = criarAppIa({
      porta: 0,
      tokenInterno: 'token-teste-ia',
      geminiModel: 'gemini-2.5-flash',
      nvidiaModel: 'llama-3.2'
    });

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      const resp = await fetch(`http://127.0.0.1:${porta}/health`);
      const body = await resp.json() as any;

      assert.equal(resp.status, 200);
      assert.equal(body.servico, 'ia');
      assert.equal(body.status, 'ok');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('deve rejeitar acesso a /v1 sem token e aceitar com token válido', async () => {
    const app = criarAppIa({
      porta: 0,
      tokenInterno: 'token-secreto-ia',
      geminiModel: 'gemini-2.5-flash',
      nvidiaModel: 'llama-3.2'
    });

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      // 1. Sem token -> 401
      const respBloqueada = await fetch(`http://127.0.0.1:${porta}/v1/analise/detectar-candidatos`, {
        method: 'POST'
      });
      assert.equal(respBloqueada.status, 401);

      // 2. Com token correto -> 400 (por body vazio, mas autenticado)
      const respAutorizada = await fetch(`http://127.0.0.1:${porta}/v1/analise/detectar-candidatos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': 'token-secreto-ia'
        },
        body: JSON.stringify({})
      });
      assert.equal(respAutorizada.status, 400);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
