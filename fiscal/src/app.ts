/**
 * Fábrica da aplicação Express do serviço /fiscal isolado.
 * Cria a instância do Express, configura middlewares de segurança,
 * autenticação por token interno e monta os roteadores de certificados, notas e parâmetros.
 * Mantido separado de server.ts para permitir testes sem prender a porta do servidor.
 */

import express from 'express';
import { carregarFiscalConfig } from './config/fiscal-config.js';
import { criarMiddlewareTokenInterno } from './api/middleware-token.js';
import { criarRouterCertificado } from './api/rotas-certificado.js';
import { criarRouterNotas } from './api/rotas-notas.js';
import { criarRouterParametros } from './api/rotas-parametros.js';
import {
  EmissorIdempotenteService,
  type EmissaoRepositorio,
  type RegistroNotaSalva
} from './emissao/emissor-idempotente.js';

export function criarAppFiscal(config = carregarFiscalConfig()): express.Express {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // Healthcheck público desprotegido para orquestração no Easypanel
  app.get('/health', (_req, res) => {
    res.json({
      servico: 'fiscal',
      status: 'ok',
      timestamp: new Date().toISOString()
    });
  });

  // Repositório em memória padrão para emissões locais
  const registrosNotas = new Map<string, RegistroNotaSalva>();
  const repoNotas: EmissaoRepositorio = {
    async buscarPorPedidoId(id) {
      return registrosNotas.get(id) || null;
    },
    async salvar(reg) {
      registrosNotas.set(reg.pedidoId, reg);
    },
    async obterProximoNumeroDps() {
      return registrosNotas.size + 1;
    }
  };

  const transmissorSimulado = {
    async transmitir(dados: { numeroDps: number }) {
      return {
        sucesso: true,
        chaveAcesso: `352610${dados.numeroDps}0001000000000000001`,
        numeroNota: String(dados.numeroDps)
      };
    }
  };

  const emissorService = new EmissorIdempotenteService(repoNotas, transmissorSimulado);

  // Proteger rotas da API com token interno
  const authInterna = criarMiddlewareTokenInterno(config.tokenInterno);
  app.use('/v1', authInterna);

  app.use('/v1', criarRouterCertificado());
  app.use('/v1', criarRouterNotas(emissorService, repoNotas));
  app.use('/v1', criarRouterParametros());

  return app;
}
