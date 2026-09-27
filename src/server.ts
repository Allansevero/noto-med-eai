/**
 * Servidor HTTP principal da aplicação Notomed Whats.
 * Expõe as rotas de webhook da Evolution API, API de autenticação por OTP
 * e serve a interface web da tela única de entrada para os médicos (seção 1 e 4.6).
 */

import express, { type Request, type Response } from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { config } from './config.js';
import { pool } from './io/postgres/pool.js';
import { PostgresOtpRepositorio } from './io/postgres/postgres-otp-repositorio.js';
import { PostgresAtendimentoRepositorio } from './io/postgres/postgres-atendimento-repositorio.js';
import { EvolutionApiClient } from './io/evolution/evolution-api-client.js';
import { SupabaseAuthAdminService } from './io/supabase/supabase-auth-admin-service.js';

import { solicitarOtp } from './otp/solicitar-otp.js';
import { autenticarComOtp } from './auth/autenticar-com-otp.js';
import { processarMensagemWebhook } from './fluxos/processar-mensagem-webhook.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function criarAppExpress() {
  const app = express();
  app.use(express.json());

  // Instanciação dos adaptadores de infraestrutura
  const otpRepo = new PostgresOtpRepositorio(pool);
  const atendimentoRepo = new PostgresAtendimentoRepositorio(pool, config.encryptionKey);
  const evolutionClient = new EvolutionApiClient(
    config.evolutionApiUrl,
    config.evolutionGlobalApiKey,
    config.evolutionOfficialInstanceName
  );
  const authAdminService = new SupabaseAuthAdminService(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
    pool
  );

  // Healthcheck para o Easypanel
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // UI Web de Entrada
  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(join(__dirname, 'ui', 'index.html'));
  });

  // Rota de Solicitação de OTP (WhatsApp)
  app.post('/api/auth/otp/solicitar', async (req: Request, res: Response) => {
    try {
      const { telefone } = req.body || {};
      if (!telefone) {
        return res.status(400).json({ ok: false, detalhe: 'Telefone é obrigatório' });
      }

      const resultado = await solicitarOtp(telefone, {
        repositorio: otpRepo,
        enviador: evolutionClient,
        pepper: config.appPepper
      });

      if (!resultado.ok) {
        return res.status(400).json(resultado);
      }

      return res.json(resultado);
    } catch (err: any) {
      console.error('Erro na solicitação de OTP:', err);
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro interno do servidor' });
    }
  });

  // Rota de Verificação de OTP e Sessão Supabase
  app.post('/api/auth/otp/verificar', async (req: Request, res: Response) => {
    try {
      const { telefone, codigo } = req.body || {};
      if (!telefone || !codigo) {
        return res.status(400).json({ ok: false, detalhe: 'Telefone e código são obrigatórios' });
      }

      const resultado = await autenticarComOtp(telefone, codigo, {
        otpRepositorio: otpRepo,
        authAdminService,
        pepper: config.appPepper
      });

      if (!resultado.ok) {
        return res.status(401).json(resultado);
      }

      return res.json(resultado);
    } catch (err: any) {
      console.error('Erro na verificação de OTP:', err);
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro interno do servidor' });
    }
  });

  // Rota Webhook da Evolution API (suporta rota direta e subrotas com eventos)
  const webhookHandler = async (req: Request, res: Response) => {
    const tokenRecebido =
      (req.headers['apikey'] as string) ||
      (req.headers['x-webhook-secret'] as string) ||
      (req.headers['authorization'] as string) ||
      (req.query['secret'] as string) ||
      (req.query['apikey'] as string) ||
      (req.query['token'] as string);

    // Se bater com a API key global da Evolution ou com o segredo do webhook, autentica
    let segredoEsperado = config.evolutionWebhookSecret;
    if (tokenRecebido && tokenRecebido === config.evolutionGlobalApiKey) {
      segredoEsperado = tokenRecebido;
    }

    const resultado = await processarMensagemWebhook(req.body, tokenRecebido, {
      repositorio: atendimentoRepo,
      enviarMensagemPaciente: evolutionClient,
      segredoConfigurado: segredoEsperado,
      pepper: config.appPepper
    });

    if (!resultado.ok) {
      const status = resultado.motivo === 'autenticacao_invalida' ? 401 : 400;
      return res.status(status).json(resultado);
    }

    return res.json(resultado);
  };

  app.post('/webhook/evolution', webhookHandler);
  app.post('/webhook/evolution/:evento', webhookHandler);

  return app;
}

// Inicia servidor quando executado diretamente
if (process.env['NODE_ENV'] !== 'test') {
  const app = criarAppExpress();
  app.listen(config.porta, config.host, () => {
    console.log(`[Notomed Whats] Servidor rodando em http://${config.host}:${config.porta}`);
  });
}
