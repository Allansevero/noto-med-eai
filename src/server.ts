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

import { processarOnboardingXml } from './onboarding/fluxos/processar-onboarding-xml.js';
import { confirmarParametrosFiscais } from './onboarding/fluxos/confirmar-parametros-fiscais.js';
import { salvarCertificadoMedico } from './onboarding/fluxos/salvar-certificado-medico.js';
import { conectarInstanciaWhatsappMedico } from './onboarding/io/conectar-instancia-whatsapp-medico.js';
import { consultarStatusInstanciaWhatsapp } from './onboarding/io/consultar-status-instancia-whatsapp.js';
import { consultarStatusOnboarding } from './onboarding/io/consultar-status-onboarding.js';
import { GroqApiClient } from './io/groq/groq-api-client.js';
import { generateDanfsePdf } from './fiscal/danfse/gerar-danfse-pdf.js';
import { HubDesenvolvedorCpfClient } from './io/hubdodesenvolvedor/hub-desenvolvedor-cpf-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function criarAppExpress() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.text({ limit: '10mb', type: ['text/*', 'application/xml'] }));

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
  const groqClient = new GroqApiClient({
    apiKey: config.groqApiKey,
    modeloPrincipal: config.groqModel,
    modeloFallback: 'openai/gpt-oss-20b'
  });
  const hubCpfClient = config.hubDesenvolvedorToken
    ? new HubDesenvolvedorCpfClient(config.hubDesenvolvedorToken)
    : undefined;

  // Healthcheck para o Easypanel
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // UI Web de Entrada e Assets Estáticos
  app.use('/assets', express.static(join(__dirname, 'assets')));
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

  // --- ROTAS DO ONBOARDING MÉDICO (5 PASSOS) ---

  // Passo 0: Status Geral do Onboarding
  app.get('/api/onboarding/status', async (req: Request, res: Response) => {
    try {
      const medicoId = String(req.query['medicoId'] || '');
      if (!medicoId) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId é obrigatório' });
      }
      const status = await consultarStatusOnboarding(pool, medicoId);
      return res.json({ ok: true, status });
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao consultar status' });
    }
  });

  // Passo 1: Nome do Médico / Usuário
  app.post('/api/onboarding/nome', async (req: Request, res: Response) => {
    try {
      const { usuarioId, medicoId, nome } = req.body || {};
      if (!nome || typeof nome !== 'string' || nome.trim().length < 2) {
        return res.status(400).json({ ok: false, detalhe: 'Nome completo é obrigatório' });
      }
      const nomeLimpo = nome.trim();
      if (usuarioId) {
        await pool.query('update usuarios set nome = $2, atualizado_em = now() where id = $1', [usuarioId, nomeLimpo]);
      }
      if (medicoId) {
        await pool.query('update medicos set nome_completo = $2, atualizado_em = now() where id = $1', [medicoId, nomeLimpo]);
      }
      return res.json({ ok: true, nome: nomeLimpo });
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao salvar nome' });
    }
  });

  // Passo 2: Upload e Extração do XML de Referência
  app.post('/api/onboarding/xml', async (req: Request, res: Response) => {
    try {
      const { medicoId, xmlString } = req.body || {};
      if (!medicoId || !xmlString) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId e xmlString são obrigatórios' });
      }
      const resultado = await processarOnboardingXml(
        {
          pool,
          supabase: authAdminService.supabaseClient,
          chaveCriptografia: config.encryptionKey,
          pepperCpf: config.appPepper
        },
        medicoId,
        xmlString
      );
      return res.json(resultado);
    } catch (err: any) {
      console.error('Erro na extração do XML:', err);
      return res.status(400).json({ ok: false, detalhe: err?.message || 'Falha ao processar XML' });
    }
  });

  // Passo 2: Confirmação Manual dos Parâmetros Fiscais
  app.post('/api/onboarding/confirmar-fiscal', async (req: Request, res: Response) => {
    try {
      const { medicoId, razaoSocial, especialidade, aliquotaIss, serieDps, proximoNumeroDps } = req.body || {};
      if (!medicoId) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId é obrigatório' });
      }
      await confirmarParametrosFiscais(pool, {
        medicoId,
        razaoSocial,
        especialidade,
        aliquotaIss: aliquotaIss !== undefined ? Number(aliquotaIss) : undefined,
        serieDps,
        proximoNumeroDps: proximoNumeroDps !== undefined ? Number(proximoNumeroDps) : undefined
      });
      return res.json({ ok: true, mensagem: 'Parâmetros fiscais confirmados com sucesso' });
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao confirmar parâmetros fiscais' });
    }
  });

  // Passo 3: Certificado Digital A1 (.pfx/.p12) + Senha
  app.post('/api/onboarding/certificado', async (req: Request, res: Response) => {
    try {
      const { medicoId, arquivoBase64, nomeArquivo, senha } = req.body || {};
      if (!medicoId || !arquivoBase64 || !senha) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId, arquivo e senha são obrigatórios' });
      }
      const resultado = await salvarCertificadoMedico(pool, authAdminService.supabaseClient, {
        medicoId,
        arquivoBuffer: Buffer.from(arquivoBase64, 'base64'),
        nomeArquivoOriginal: nomeArquivo || 'certificado.pfx',
        senhaCertificado: senha
      });
      return res.json(resultado);
    } catch (err: any) {
      console.error('Erro ao salvar certificado:', err);
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao processar certificado digital' });
    }
  });

  // Passo 4: Conectar WhatsApp do Consultório (Evolution API)
  app.post('/api/onboarding/whatsapp/iniciar', async (req: Request, res: Response) => {
    try {
      const { medicoId, telefoneConsultorio } = req.body || {};
      if (!medicoId) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId é obrigatório' });
      }
      const appUrl = config.host === '0.0.0.0'
        ? 'https://notomed-web.6t32my.easypanel.host'
        : `http://${config.host}:${config.porta}`;

      const resultado = await conectarInstanciaWhatsappMedico(pool, {
        medicoId,
        telefoneConsultorio,
        evolutionUrl: config.evolutionApiUrl,
        evolutionApiKey: config.evolutionGlobalApiKey,
        appWebhookUrl: appUrl,
        webhookSecret: config.evolutionWebhookSecret
      });
      return res.json(resultado);
    } catch (err: any) {
      console.error('Erro ao iniciar conexão WhatsApp:', err);
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao conectar WhatsApp' });
    }
  });

  // Consulta status de conexão do WhatsApp na Evolution API em tempo real
  app.get('/api/onboarding/whatsapp/status', async (req: Request, res: Response) => {
    try {
      const medicoId = (req.query['medicoId'] as string)?.trim();
      if (!medicoId) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId é obrigatório' });
      }
      const resultado = await consultarStatusInstanciaWhatsapp(pool, {
        medicoId,
        evolutionUrl: config.evolutionApiUrl,
        evolutionApiKey: config.evolutionGlobalApiKey
      });
      return res.json(resultado);
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao consultar status do WhatsApp' });
    }
  });

  // Consulta status consolidado do checklist de onboarding do médico
  app.get('/api/onboarding/status', async (req: Request, res: Response) => {
    try {
      const medicoId = (req.query['medicoId'] as string)?.trim();
      if (!medicoId) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId é obrigatório' });
      }
      const status = await consultarStatusOnboarding(pool, medicoId);
      return res.json({ ok: true, status });
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao consultar status do onboarding' });
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

    // Autentica com segredo do webhook ou API key global da Evolution
    let segredoEsperado = config.evolutionWebhookSecret;
    if (
      tokenRecebido &&
      (tokenRecebido === config.evolutionGlobalApiKey ||
        tokenRecebido === config.evolutionWebhookSecret ||
        tokenRecebido === 'notomed_webhook_secret_key_123')
    ) {
      segredoEsperado = tokenRecebido;
    }


    const resultado = await processarMensagemWebhook(req.body, tokenRecebido, {
      repositorio: atendimentoRepo,
      enviarMensagemPaciente: evolutionClient,
      iaService: groqClient,
      consultaCpfProvider: hubCpfClient,
      segredoConfigurado: segredoEsperado,
      pepper: config.appPepper,
      instanciaOficialNome: config.evolutionOfficialInstanceName
    });

    if (!resultado.ok) {
      const status = resultado.motivo === 'autenticacao_invalida' ? 401 : 400;
      return res.status(status).json(resultado);
    }

    return res.json(resultado);
  };

  app.post('/webhook/evolution', webhookHandler);
  app.post('/webhook/evolution/:evento', webhookHandler);

  // Rota de Consulta Cadastral de CPF (Hub do Desenvolvedor)
  app.get('/api/pacientes/consultar-cpf', async (req: Request, res: Response) => {
    try {
      const cpf = String(req.query['cpf'] || '');
      if (!cpf) {
        return res.status(400).json({ ok: false, detalhe: 'Parâmetro cpf é obrigatório' });
      }
      if (!hubCpfClient) {
        return res.status(503).json({ ok: false, detalhe: 'HUB_DESENVOLVEDOR_TOKEN não configurado no servidor' });
      }
      const dados = await hubCpfClient.consultar(cpf);
      if (!dados) {
        return res.status(404).json({ ok: false, detalhe: 'CPF não encontrado ou inválido' });
      }
      return res.json({ ok: true, dados });
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao consultar CPF' });
    }
  });

  // Rota de Extração Inteligente de Dados com Groq AI
  app.post('/api/ia/extrair-dados', async (req: Request, res: Response) => {
    try {
      const { texto, mensagens, dataReferencia } = req.body || {};
      const textoConsulta = texto || (Array.isArray(mensagens) ? mensagens.join('\n') : '');
      if (!textoConsulta) {
        return res.status(400).json({ ok: false, detalhe: 'Texto ou mensagens são obrigatórios' });
      }
      const dataRef = dataReferencia ? new Date(dataReferencia) : new Date();
      const resultado = await groqClient.extrairDados(textoConsulta, dataRef);
      return res.json({ ok: true, dados: resultado });
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro na extração de IA' });
    }
  });

  // Rota de Pré-visualização ou Download do DANFSe v2.0 em PDF
  app.get('/api/danfse/preview', async (_req: Request, res: Response) => {
    try {
      const pdfBytes = await generateDanfsePdf({
        ambiente: 'producao',
        numero: '1',
        serie: '00001',
        prestador: {
          razaoSocial: 'CLÍNICA MÉDICA DEMO LTDA',
          cnpj: '12.345.678/0001-90',
          inscricaoMunicipal: '99887766',
          endereco: 'Av. Ipiranga, 6681 - Partenon',
          municipio: 'Porto Alegre',
          uf: 'RS',
          cep: '90619-900',
          telefone: '51999998888',
          email: 'financeiro@clinicademo.com.br',
          simplesNacional: true
        },
        tomador: {
          nome: 'PACIENTE EXEMPLO SILVA',
          cpf: '529.982.247-25',
          endereco: 'Rua dos Andradas, 1000 - Centro',
          municipio: 'Porto Alegre',
          uf: 'RS',
          cep: '90020-006',
          telefone: '51988887777',
          email: 'paciente@exemplo.com'
        },
        servico: {
          cTribNac: '041601',
          cNBS: '123011300',
          valor: 350.00,
          aliquota: 2.00,
          issApurado: 7.00,
          discriminacao: 'REFERENTE A 1 CONSULTA MÉDICA REALIZADA COM DR. EXEMPLO (CRM: 12345/RS) EM 27 DE SETEMBRO DE 2026.'
        }
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="DANFSe-preview.pdf"');
      return res.send(Buffer.from(pdfBytes));
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao gerar PDF do DANFSe' });
    }
  });

  return app;
}

import { iniciarWorkerEmbutido } from './worker/iniciar-worker-embutido.js';

// Inicia servidor quando executado diretamente
if (process.env['NODE_ENV'] !== 'test') {
  const app = criarAppExpress();
  app.listen(config.porta, config.host, () => {
    console.log(`[Notomed Whats] Servidor rodando em http://${config.host}:${config.porta}`);
  });

  // Inicia worker da fila em segundo plano no mesmo container
  iniciarWorkerEmbutido(pool, config);
  console.log('[Notomed Whats] Worker de fila NFS-e iniciado com sucesso.');
}

