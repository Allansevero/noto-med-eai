/**
 * Fábrica da aplicação Express do serviço /ia isolado.
 * Configura rotas de detecção multimodal, correlação de consultas e autocorreção fiscal,
 * protegidas por token interno. Isolado de server.ts para execução ágil de testes.
 */

import express from 'express';
import { carregarIaConfig } from './config/ia-config.js';
import { criarMiddlewareTokenInternoIa } from './api/middleware-token.js';
import { criarRouterAnalise } from './api/rotas-analise.js';

export function criarAppIa(config = carregarIaConfig()): express.Express {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Healthcheck público desprotegido para monitoramento do Easypanel
  app.get('/health', (_req, res) => {
    res.json({
      servico: 'ia',
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  // Proteção das rotas de negócio com token interno
  const authInterna = criarMiddlewareTokenInternoIa(config.tokenInterno);
  app.use('/v1', authInterna);

  app.use('/v1', criarRouterAnalise());

  return app;
}
