/**
 * Testes unitários para o middleware de autenticação interna por token.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import { criarMiddlewareTokenInterno } from './middleware-token.js';

describe('MiddlewareTokenInterno em /fiscal', () => {
  it('deve permitir requisições com X-Internal-Token correto', () => {
    const middleware = criarMiddlewareTokenInterno('segredo-123');
    let nextChamado = false;

    const req = {
      headers: { 'x-internal-token': 'segredo-123' }
    } as unknown as Request;

    const res = {} as Response;

    middleware(req, res, () => {
      nextChamado = true;
    });

    assert.equal(nextChamado, true);
  });

  it('deve barrar com status 401 quando token for incorreto ou ausente', () => {
    const middleware = criarMiddlewareTokenInterno('segredo-123');
    let statusRetornado = 0;
    let jsonRetornado: any = null;

    const req = {
      headers: { 'x-internal-token': 'errado' }
    } as unknown as Request;

    const res = {
      status(s: number) {
        statusRetornado = s;
        return this;
      },
      json(j: any) {
        jsonRetornado = j;
        return this;
      }
    } as unknown as Response;

    middleware(req, res, () => {});

    assert.equal(statusRetornado, 401);
    assert.equal(jsonRetornado.sucesso, false);
    assert.equal(jsonRetornado.codigo, 'TOKEN_INTERNO_INVALIDO');
  });
});
