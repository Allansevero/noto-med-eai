/**
 * Último middleware do app: sem ele o Express responde HTML com o handler
 * padrão (inclusive stack trace fora de produção) e o front, que espera JSON
 * `{ ok, detalhe }`, quebra ao interpretar a resposta. Só faz I/O (log/resposta);
 * a decisão de status está em `montar-resposta-erro-http.ts`.
 */

import type { ErrorRequestHandler } from 'express';
import { montarRespostaErroHttp } from './montar-resposta-erro-http.js';

export const tratarErrosHttp: ErrorRequestHandler = (erro, req, res, next) => {
  if (res.headersSent) return next(erro);
  const { status, corpo } = montarRespostaErroHttp(erro);
  if (status >= 500) console.error('[HTTP] Erro não tratado', { metodo: req.method, rota: req.path }, erro);
  res.status(status).json(corpo);
};
