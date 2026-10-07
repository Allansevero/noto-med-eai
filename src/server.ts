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
import { ErroAdocaoReferencia } from './onboarding/io/confirmar-politica-emissao.js';
import { confirmarParametrosFiscais } from './onboarding/fluxos/confirmar-parametros-fiscais.js';
import { registrarConsentimentoFiscal, adotarReferenciaConsentida, versaoConsentimentoFiscal } from './onboarding/fluxos/consentimento-fiscal.js';
import { salvarCertificadoMedico } from './onboarding/fluxos/salvar-certificado-medico.js';
import { conectarInstanciaWhatsappMedico } from './onboarding/io/conectar-instancia-whatsapp-medico.js';
import { consultarStatusInstanciaWhatsapp } from './onboarding/io/consultar-status-instancia-whatsapp.js';
import { consultarStatusOnboarding } from './onboarding/io/consultar-status-onboarding.js';
import { resolverMedicoId } from './onboarding/io/resolver-medico-id.js';
import { salvarPerfilProfissional, ErroPerfilProfissional } from './io/postgres/salvar-perfil-profissional.js';
import { ZodError } from 'zod';
import { GroqApiClient } from './io/groq/groq-api-client.js';
import { generateDanfsePdf } from './fiscal/danfse/gerar-danfse-pdf.js';
import { HubDesenvolvedorCpfClient } from './io/hubdodesenvolvedor/hub-desenvolvedor-cpf-client.js';
import { PostgresBillingRepositorio } from './io/postgres/postgres-billing-repositorio.js';
import { StripeService } from './billing/stripe-service.js';
import { processarWebhookStripe } from './billing/processar-webhook-stripe.js';
import { AdnNfseClient } from './io/fiscal/adn-nfse-client.js';
import { extrairChavesCertificado } from './io/fiscal/extrair-chaves-certificado.js';
import { carregarCertificadoMedico } from './io/fiscal/carregar-certificado-medico.js';
import { sincronizarHistoricoEvolutionUmaVez } from './onboarding/io/sincronizar-historico-evolution.js';
import { criarDisparadorTreino } from './onboarding/fluxos/disparar-treino-onboarding.js';
import { PostgresDadosProfissionaisService } from './io/postgres/postgres-dados-profissionais-service.js';
import { registrarConexaoWhatsapp } from './onboarding/io/registrar-conexao-whatsapp.js';
import { criarRouterWhatsappDesenvolvedor } from './desenvolvedor/whatsapp-router.js';
import { EvolutionColetorClient } from './desenvolvedor/evolution-coletor.js';
import { criarRouterFiscalDesenvolvedor } from './desenvolvedor/fiscal-router.js';
import { criarRouterTribemdDesenvolvedor } from './desenvolvedor/tribemd-router.js';
import { NavegadorTribemd } from './desenvolvedor/tribemd-navegador.js';
import { GroqDecisorTribemd } from './desenvolvedor/tribemd-agente.js';
import { compararPerfilFiscal } from './onboarding/fluxos/comparar-perfil-fiscal.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function criarAppExpress() {
  const app = express();
  app.use(
    express.json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      }
    })
  );
  app.use(express.text({ limit: '10mb', type: ['text/*', 'application/xml'] }));

  // Instanciação dos adaptadores de infraestrutura
  const otpRepo = new PostgresOtpRepositorio(pool);
  const atendimentoRepo = new PostgresAtendimentoRepositorio(pool, config.encryptionKey);
  const dispararTreino = criarDisparadorTreino(pool, config);
  const evolutionClient = new EvolutionApiClient(
    config.evolutionApiUrl,
    config.evolutionGlobalApiKey,
    config.evolutionOfficialInstanceName
  );
  const dadosProfissionais = new PostgresDadosProfissionaisService(pool, evolutionClient, config.evolutionOfficialInstanceName);
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
  const billingRepo = new PostgresBillingRepositorio(pool);
  const adnNfseClient = new AdnNfseClient();
  const stripeService = config.stripeSecretKey
    ? new StripeService({
        secretKey: config.stripeSecretKey,
        priceId: config.stripePriceId || 'price_1UFaloBMqkVPUWioDTWXIPv6',
        webhookSecret: config.stripeWebhookSecret
      })
    : undefined;

  const sincronizarHistoricoInstancia = (nomeInstancia: string) =>
    sincronizarHistoricoEvolutionUmaVez({
      baseUrl: config.evolutionApiUrl,
      apiKey: config.evolutionGlobalApiKey,
      nomeInstancia,
      repositorio: atendimentoRepo,
      consultaCpfProvider: hubCpfClient,
      pepper: config.appPepper
    });

  // Healthcheck para o Easypanel
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // A área de teste não usa os repositórios, filas ou certificados dos médicos.
  app.use('/api/desenvolvedor/fiscal', criarRouterFiscalDesenvolvedor({
    ativo: Boolean(config.desenvolvedorFiscalAtivo), token: config.desenvolvedorFiscalToken
  }));
  app.use('/api/desenvolvedor/whatsapp', criarRouterWhatsappDesenvolvedor({
    ativo: Boolean(config.desenvolvedorFiscalAtivo), token: config.desenvolvedorFiscalToken,
    evolution: new EvolutionColetorClient(config.evolutionApiUrl, config.evolutionGlobalApiKey)
  }));
  app.use('/api/desenvolvedor/tribemd', criarRouterTribemdDesenvolvedor({
    ativo: Boolean(config.desenvolvedorFiscalAtivo), token: config.desenvolvedorFiscalToken,
    configurado: Boolean(config.groqApiKey), decisor: new GroqDecisorTribemd(config.groqApiKey, config.groqModel, process.env['TRIBEMD_VISION_MODEL'] || 'meta-llama/llama-4-scout-17b-16e-instruct'),
    criarNavegador: signal => NavegadorTribemd.criar(config.chromiumExecutablePath || '/usr/bin/chromium-browser', signal)
  }));
  if (config.desenvolvedorFiscalAtivo) {
    app.get('/desenvolvedor/tribemd', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.sendFile(join(__dirname, 'ui', 'desenvolvedor-tribemd.html'));
    });
    app.get('/desenvolvedor/whatsapp', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.sendFile(join(__dirname, 'ui', 'desenvolvedor-whatsapp.html'));
    });
    app.get('/desenvolvedor', (_req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.sendFile(join(__dirname, 'ui', 'desenvolvedor-fiscal.html'));
    });
  }

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
      const medicoIdRaw = String(req.query['medicoId'] || '');
      if (!medicoIdRaw) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId é obrigatório' });
      }
      const medicoId = await resolverMedicoId(pool, medicoIdRaw);
      const status = await consultarStatusOnboarding(pool, medicoId, config.preparacaoFiscalAtiva);
      dispararTreino(medicoId);
      if (status.passos.passo4WhatsappConectado) {
        const nomeInstancia = `medico_${medicoId.replace(/-/g, '').slice(0, 12)}`;
        void sincronizarHistoricoInstancia(nomeInstancia).then((resultado) => {
          console.info('[Evolution] Histórico sincronizado:', resultado);
        }).catch((erro: any) => {
          console.warn('[Evolution] Histórico ainda indisponível:', erro?.message || erro);
        });
      }
      return res.json({ ok: true, status, medicoId });
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao consultar status' });
    }
  });

  // Passo 1: Nome do Médico / Usuário
  app.post('/api/onboarding/nome', async (req: Request, res: Response) => {
    try {
      const { usuarioId, medicoId: medicoIdRaw, nome } = req.body || {};
      if (!nome || typeof nome !== 'string' || nome.trim().length < 2) {
        return res.status(400).json({ ok: false, detalhe: 'Nome completo é obrigatório' });
      }
      const nomeLimpo = nome.trim();
      if (usuarioId) {
        await pool.query('update usuarios set nome = $2, atualizado_em = now() where id = $1', [usuarioId, nomeLimpo]);
      }
      let medicoIdFinal = medicoIdRaw;
      if (medicoIdRaw || usuarioId) {
        try {
          medicoIdFinal = await resolverMedicoId(pool, medicoIdRaw || usuarioId);
          await pool.query('update medicos set nome_completo = $2, atualizado_em = now() where id = $1', [medicoIdFinal, nomeLimpo]);
        } catch {
          // Mantém medicoIdRaw se não conseguir resolver
        }
      }
      return res.json({ ok: true, nome: nomeLimpo, medicoId: medicoIdFinal });
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao salvar nome' });
    }
  });

  // Atualizar Perfil do Médico (Nome, CRM, RQE) na aba Conta
  app.post('/api/conta/perfil', async (req: Request, res: Response) => {
    try {
      const { usuarioId, medicoId: medicoIdRaw, nome, crm, rqe, email } = req.body || {};
      const medicoIdFinal = await resolverMedicoId(pool, medicoIdRaw || usuarioId);

      const perfil = await salvarPerfilProfissional(pool, { medicoId: medicoIdFinal, usuarioId, nome, crm, rqe, email });
      await dadosProfissionais.retomar(medicoIdFinal);
      return res.json({ ok: true, ...perfil });
    } catch (err: any) {
      if (err instanceof ZodError) return res.status(400).json({ ok: false, detalhe: err.issues[0]?.message });
      if (err?.code === '23505') return res.status(409).json({ ok: false, detalhe: 'Este e-mail já está associado a outra conta.' });
      if (err instanceof ErroPerfilProfissional) return res.status(400).json({ ok: false, detalhe: err.message });
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao atualizar perfil' });
    }
  });

  app.post('/api/onboarding/comparar-fiscal', async (req: Request, res: Response) => {
    if (!config.comparacaoFiscalAtiva) return res.json({ ok: true, ativo: false });
    try {
      if (!req.body?.medicoId) return res.status(400).json({ ok: false, detalhe: 'Médico não informado.' });
      const medicoId = await resolverMedicoId(pool, req.body.medicoId);
      const comparacao = await compararPerfilFiscal({ pool, supabase: authAdminService.supabaseClient, pepper: config.appPepper }, medicoId);
      return res.json({ ok: true, ativo: true, comparacao });
    } catch (erro: any) {
      const detalhe = erro?.code === '42P01' ? 'Comparação fiscal ainda não preparada no servidor. A equipe precisa executar a migração.'
        : erro?.message || 'Não foi possível comparar os dados fiscais agora.';
      return res.status(400).json({ ok: false, ativo: true, detalhe });
    }
  });

  // Nova consulta usando o A1 já armazenado; nenhuma cidade é fixada no código.
  app.post('/api/onboarding/buscar-referencia', async (req: Request, res: Response) => {
    try {
      if (!req.body?.medicoId) return res.status(400).json({ ok: false, detalhe: 'Médico não informado.' });
      const medicoId = await resolverMedicoId(pool, req.body.medicoId);
      const certificado = await carregarCertificadoMedico(pool, authAdminService.supabaseClient, medicoId);
      if (!certificado) throw new Error('Cadastre seu certificado A1 para localizar a nota.');
      const titular = extrairChavesCertificado(certificado.pfxBuffer, certificado.senhaCertificado);
      if (!titular.documentoTitular || !titular.validoAte || titular.validoAte < new Date()
        || (titular.validoDe && titular.validoDe > new Date())) throw new Error('O certificado precisa estar válido e identificar seu titular.');
      const consulta = await adnNfseClient.buscarNfseMaisRecente(certificado.pfxBuffer, certificado.senhaCertificado, titular.documentoTitular);
      console.info('[ADN] Busca de referência concluída:', consulta.resumo);
      const fiscal = await processarOnboardingXml({ pool, supabase: authAdminService.supabaseClient,
        documentoTitularEsperado: titular.documentoTitular, chaveCriptografia: config.encryptionKey, pepperCpf: config.appPepper },
      medicoId, consulta.documento.xml);
      const adocaoFiscal = await adotarReferenciaConsentida({ pool, preparacaoFiscalAtiva: Boolean(config.preparacaoFiscalAtiva) },
        medicoId, fiscal.parametros.dadosReformaTributaria.hash);
      if (adocaoFiscal.ok) dispararTreino(medicoId);
      return res.json({ ...fiscal, medicoId, fonte: 'adn', nsu: consulta.documento.nsu, adocaoFiscal });
    } catch (erro: any) {
      console.warn('[ADN] Busca de referência pendente:', { etapa: 'busca_referencia', codigo: erro?.codigo || 'BUSCA_FALHOU', diagnostico: erro?.diagnostico, mensagem: erro?.message });
      return res.status(400).json({ ok: false, detalhe: 'Ainda não conseguimos obter sua nota padrão pelo certificado. Você não precisa enviar arquivos. Tente novamente mais tarde; se persistir, a equipe precisa verificar a disponibilidade da nota no sistema de origem.' });
    }
  });

  // Passo 3 (fallback): Upload e extracao manual do XML de referencia
  app.post('/api/onboarding/xml', async (req: Request, res: Response) => {
    try {
      const { medicoId: medicoIdRaw, xmlString } = req.body || {};
      if (!medicoIdRaw || !xmlString) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId e xmlString são obrigatórios' });
      }
      const medicoId = await resolverMedicoId(pool, medicoIdRaw);
      const certificado = await carregarCertificadoMedico(pool, authAdminService.supabaseClient, medicoId);
      if (!certificado) throw new Error('Cadastre o certificado A1 antes de importar a nota de referência.');
      const documentoTitularEsperado = extrairChavesCertificado(certificado.pfxBuffer, certificado.senhaCertificado).documentoTitular;
      if (!documentoTitularEsperado) throw new Error('Não foi possível identificar o titular do certificado.');
      const resultado = await processarOnboardingXml(
        {
          pool,
          documentoTitularEsperado,
          supabase: authAdminService.supabaseClient,
          chaveCriptografia: config.encryptionKey,
          pepperCpf: config.appPepper
        },
        medicoId,
        xmlString
      );
      return res.json({ ...resultado, medicoId });
    } catch (err: any) {
      console.error('Erro na extração do XML:', err);
      return res.status(400).json({ ok: false, detalhe: err?.message || 'Falha ao processar XML' });
    }
  });

  // Passo 3: Confirmacao dos parametros fiscais encontrados
  app.post('/api/onboarding/confirmar-fiscal', async (req: Request, res: Response) => {
    try {
      const {
        medicoId: medicoIdRaw,
        razaoSocial,
        especialidade,
        aliquotaIss,
        serieDps,
        proximoNumeroDps,
        opcaoSimplesNacional,
        parametrosEmissao,
        referenciaHash,
        usarReferencia
      } = req.body || {};
      if (!medicoIdRaw) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId é obrigatório' });
      }
      const medicoId = await resolverMedicoId(pool, medicoIdRaw);
      if ((usarReferencia === true || parametrosEmissao !== undefined) && !config.preparacaoFiscalAtiva) return res.status(503).json({ ok: false, codigo: 'PREPARACAO_FISCAL_INATIVA', detalhe: 'A validação fiscal automática ainda não está ativada no servidor. A equipe precisa ativá-la para concluir seu cadastro.' });
      await confirmarParametrosFiscais(pool, usarReferencia === true ? { medicoId, referenciaHash, usarReferencia: true } : {
        medicoId,
        razaoSocial,
        especialidade,
        aliquotaIss: aliquotaIss !== undefined ? Number(aliquotaIss) : undefined,
        serieDps,
        proximoNumeroDps: proximoNumeroDps !== undefined ? Number(proximoNumeroDps) : undefined,
        opcaoSimplesNacional,
        parametrosEmissao,
        referenciaHash,
        usarReferencia: usarReferencia === true
      });
      dispararTreino(medicoId);
      return res.json({ ok: true, mensagem: 'Parâmetros fiscais confirmados com sucesso', medicoId });
    } catch (err: any) {
      if (req.body?.usarReferencia === true) {
        console.warn('[Fiscal] Adoção da referência pendente:', { codigo: err?.codigo || 'CONFIRMACAO_FALHOU', diagnostico: err?.diagnostico, mensagem: err?.message });
        if (err instanceof ErroAdocaoReferencia) return res.status(400).json({ ok: false, codigo: err.codigo, detalhe: err.message });
        return res.status(400).json({ ok: false, detalhe: 'Ainda não conseguimos adotar a configuração completa dessa nota. Busque a referência novamente; se persistir, a equipe precisa analisar o caso antes de liberar a emissão.' });
      }
      return res.status(400).json({ ok: false, detalhe: Array.isArray(err?.issues)
        ? err.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; ')
        : err?.message || 'Erro ao confirmar parâmetros fiscais' });
    }
  });

  // Passo 2: Certificado A1 + importacao automatica da ultima NFS-e pelo ADN
  app.post('/api/onboarding/certificado', async (req: Request, res: Response) => {
    try {
      const { medicoId: medicoIdRaw, arquivoBase64, nomeArquivo, senha, consentimentoFiscal } = req.body || {};
      if (consentimentoFiscal !== undefined && consentimentoFiscal !== versaoConsentimentoFiscal) {
        return res.status(400).json({ ok: false, detalhe: 'Atualize a página antes de continuar com o certificado.' });
      }
      if (!medicoIdRaw || !arquivoBase64 || !senha) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId, arquivo e senha são obrigatórios' });
      }
      const medicoId = await resolverMedicoId(pool, medicoIdRaw);
      const arquivoBuffer = Buffer.from(arquivoBase64, 'base64');

      let documentoTitular: string | undefined;
      try {
        const certificado = extrairChavesCertificado(arquivoBuffer, senha);
        if (certificado.validoAte && certificado.validoAte.getTime() < Date.now()) {
          return res.status(400).json({ ok: false, detalhe: 'O certificado A1 informado esta vencido.' });
        }
        documentoTitular = certificado.documentoTitular;
      } catch (err: any) {
        return res.status(400).json({
          ok: false,
          detalhe: `Certificado A1 ou senha invalidos: ${err?.message || 'nao foi possivel abrir o arquivo'}`
        });
      }

      const resultado = await salvarCertificadoMedico(pool, authAdminService.supabaseClient, {
        medicoId,
        arquivoBuffer,
        nomeArquivoOriginal: nomeArquivo || 'certificado.pfx',
        senhaCertificado: senha
      });

      if (consentimentoFiscal === versaoConsentimentoFiscal) {
        await registrarConsentimentoFiscal(pool, medicoId, resultado.certificadoId);
      }

      try {
        if (!documentoTitular) {
          throw new Error('Nao foi possivel identificar o CPF/CNPJ do titular no certificado A1.');
        }
        const consulta = await adnNfseClient.buscarNfseMaisRecente(arquivoBuffer, senha, documentoTitular);
        console.info('[ADN] Busca de referência concluída:', consulta.resumo);
        const fiscal = await processarOnboardingXml(
          {
            pool,
            documentoTitularEsperado: documentoTitular,
            supabase: authAdminService.supabaseClient,
            chaveCriptografia: config.encryptionKey,
            pepperCpf: config.appPepper
          },
          medicoId,
          consulta.documento.xml
        );

        const adocaoFiscal = await adotarReferenciaConsentida({ pool, preparacaoFiscalAtiva: Boolean(config.preparacaoFiscalAtiva) },
          medicoId, fiscal.parametros.dadosReformaTributaria.hash);
        if (adocaoFiscal.ok) dispararTreino(medicoId);
        return res.json({
          ...resultado,
          medicoId,
          adocaoFiscal,
          importacaoFiscal: {
            ...fiscal,
            fonte: 'adn',
            nsu: consulta.documento.nsu,
            chaveAcesso: consulta.documento.chaveAcesso
          }
        });
      } catch (err: any) {
        console.warn('[ADN] Importacao automatica indisponivel:', { etapa: 'importacao_referencia', codigo: err?.codigo || 'IMPORTACAO_FALHOU', diagnostico: err?.diagnostico, mensagem: err?.message });
        return res.json({
          ...resultado,
          medicoId,
          importacaoFiscal: {
            ok: false,
            codigo: err?.codigo || 'IMPORTACAO_FALHOU',
            diagnostico: err?.diagnostico,
            detalhe: err?.message || 'Nenhuma NFS-e compativel foi encontrada no ADN.'
          }
        });
      }
    } catch (err: any) {
      console.error('Erro ao salvar certificado:', err);
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao processar certificado digital' });
    }
  });

  // Passo 4: Conectar WhatsApp do Consultório (Evolution API)
  app.post('/api/onboarding/whatsapp/iniciar', async (req: Request, res: Response) => {
    try {
      const { medicoId: medicoIdRaw, telefoneConsultorio, modoConexao } = req.body || {};
      if (modoConexao !== undefined && modoConexao !== 'codigo' && modoConexao !== 'qrcode') {
        return res.status(400).json({ ok: false, detalhe: 'Modo de conexão inválido.' });
      }
      if (!medicoIdRaw) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId é obrigatório' });
      }
      const medicoId = await resolverMedicoId(pool, medicoIdRaw);
      const appUrl = config.host === '0.0.0.0'
        ? 'https://notomed-web.6t32my.easypanel.host'
        : `http://${config.host}:${config.porta}`;

      const resultado = await conectarInstanciaWhatsappMedico(pool, {
        medicoId,
        telefoneConsultorio,
        modoConexao,
        evolutionUrl: config.evolutionApiUrl,
        evolutionApiKey: config.evolutionGlobalApiKey,
        appWebhookUrl: appUrl,
        webhookSecret: config.evolutionWebhookSecret
      });
      if (resultado.ok) dispararTreino(medicoId);
      if (resultado.diagnostico) {
        console.warn('[WhatsApp] Conexão pendente:', {
          medicoId, modoConexao: modoConexao || 'codigo', diagnostico: resultado.diagnostico
        });
      }
      return res.json({ ...resultado, medicoId });
    } catch (err: any) {
      console.error('Erro ao iniciar conexão WhatsApp:', err);
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao conectar WhatsApp' });
    }
  });

  // Consulta status de conexão do WhatsApp na Evolution API em tempo real
  app.get('/api/onboarding/whatsapp/status', async (req: Request, res: Response) => {
    try {
      const medicoIdRaw = (req.query['medicoId'] as string)?.trim();
      if (!medicoIdRaw) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId é obrigatório' });
      }
      const medicoId = await resolverMedicoId(pool, medicoIdRaw);
      const resultado = await consultarStatusInstanciaWhatsapp(pool, {
        medicoId,
        evolutionUrl: config.evolutionApiUrl,
        evolutionApiKey: config.evolutionGlobalApiKey
      });
      if (resultado.conectado) dispararTreino(medicoId);
      return res.json({ ...resultado, medicoId });
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao consultar status do WhatsApp' });
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
        tokenRecebido === config.evolutionWebhookSecret)
    ) {
      segredoEsperado = tokenRecebido;
    }


    const resultado = await processarMensagemWebhook(req.body, tokenRecebido, {
      repositorio: atendimentoRepo,
      dadosProfissionais,
      billingRepositorio: billingRepo,
      enviarMensagemPaciente: evolutionClient,
      iaService: groqClient,
      consultaCpfProvider: hubCpfClient,
      segredoConfigurado: segredoEsperado,
      pepper: config.appPepper,
      instanciaOficialNome: config.evolutionOfficialInstanceName,
      async aoAtualizarConexao(evento) {
        if (evento.instancia === config.evolutionOfficialInstanceName) return;
        const medicoId = await registrarConexaoWhatsapp(pool, evento);
        if (medicoId) dispararTreino(medicoId);
      }
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

  // --- ROTAS DO STRIPE BILLING E LIMITES ---

  // Webhook da Stripe (ativa plano Mensal, sincroniza faturas e cancelamentos)
  app.post('/api/stripe/webhook', async (req: Request, res: Response) => {
    try {
      if (!stripeService) {
        return res.status(503).json({ ok: false, detalhe: 'Stripe não configurado no servidor' });
      }
      const sig = (req.headers['stripe-signature'] as string) || '';
      const rawBody = (req as any).rawBody || req.body;
      const evento = stripeService.construirEventoWebhook(rawBody, sig);
      const resultado = await processarWebhookStripe(evento, { repositorio: billingRepo });
      return res.json(resultado);
    } catch (err: any) {
      console.error('Erro no webhook da Stripe:', err?.message);
      return res.status(400).send(`Webhook Error: ${err?.message}`);
    }
  });

  // Criar sessão de Checkout para assinatura do Plano Mensal (R$ 100/mês, 100 notas/mês)
  app.post('/api/billing/checkout', async (req: Request, res: Response) => {
    try {
      const { medicoId: medicoIdRaw } = req.body || {};
      if (!medicoIdRaw) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId é obrigatório' });
      }
      if (!stripeService) {
        return res.status(503).json({ ok: false, detalhe: 'Stripe não configurado' });
      }

      const medicoId = await resolverMedicoId(pool, medicoIdRaw);
      const info = await billingRepo.buscarContaPorMedico(medicoId);
      if (!info) {
        return res.status(404).json({ ok: false, detalhe: 'Médico não encontrado' });
      }

      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const baseUrl = `${protocol}://${host}`;

      const checkoutUrl = await stripeService.criarSessaoCheckout({
        medicoId: info.medicoId,
        contaId: info.contaId,
        customerEmail: info.email,
        telefone: info.telefone,
        successUrl: `${baseUrl}/?sucesso_assinatura=true`,
        cancelUrl: `${baseUrl}/?cancelou_assinatura=true`
      });

      return res.json({ ok: true, checkoutUrl });
    } catch (err: any) {
      console.error('Erro ao criar checkout Stripe:', err);
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao gerar checkout' });
    }
  });

  // Acesso ao Portal do Cliente Stripe (gerenciamento de cartão, faturas e cancelamento)
  app.post('/api/billing/portal', async (req: Request, res: Response) => {
    try {
      const { medicoId: medicoIdRaw } = req.body || {};
      if (!medicoIdRaw || !stripeService) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId inválido ou Stripe indisponível' });
      }
      const medicoId = await resolverMedicoId(pool, medicoIdRaw);
      const info = await billingRepo.buscarContaPorMedico(medicoId);
      if (!info?.stripeCustomerId) {
        return res.status(400).json({ ok: false, detalhe: 'Nenhuma assinatura Stripe vinculada a este médico' });
      }

      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const returnUrl = `${protocol}://${host}/`;

      const portalUrl = await stripeService.criarSessaoPortal({
        stripeCustomerId: info.stripeCustomerId,
        returnUrl
      });

      return res.json({ ok: true, portalUrl });
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao abrir portal da Stripe' });
    }
  });

  // Consulta do status de uso e limites atuais do médico
  app.get('/api/billing/status', async (req: Request, res: Response) => {
    try {
      const medicoIdRaw = (req.query['medicoId'] as string)?.trim();
      if (!medicoIdRaw) {
        return res.status(400).json({ ok: false, detalhe: 'medicoId é obrigatório' });
      }
      const medicoId = await resolverMedicoId(pool, medicoIdRaw);
      const uso = await billingRepo.buscarUsoELimiteMedico(medicoId);
      const info = await billingRepo.buscarContaPorMedico(medicoId);
      return res.json({ ok: true, uso, info });
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao consultar status de faturamento' });
    }
  });

  if (process.env['NODE_ENV'] !== 'test') {
    if (config.treinoOnboardingAtivo) {
      // Retoma apenas intervalos entre mensagens já confirmadas, nunca envios incertos.
      void pool.query(`select medico_id from onboarding_treinos_whatsapp where estado = 'pendente'`)
        .then(({ rows }) => rows.forEach(row => dispararTreino(row.medico_id)))
        .catch(() => console.warn('[TreinoOnboarding] Não foi possível consultar treinos pendentes. Verifique a migração.'));
    }
    setTimeout(() => {
      void pool.query(
        `select nome_instancia
         from whatsapp_instancias
         where status = 'conectado' and oficial = false`
      ).then(async ({ rows }) => {
        for (const row of rows) {
          try {
            const resultado = await sincronizarHistoricoInstancia(row.nome_instancia);
            console.info('[Evolution] Histórico recuperado ao iniciar:', resultado);
          } catch (erro: any) {
            console.warn('[Evolution] Histórico não recuperado ao iniciar:', erro?.message || erro);
          }
        }
      }).catch((erro: any) => {
        console.warn('[Evolution] Falha ao listar instâncias para histórico:', erro?.message || erro);
      });
    }, 5_000);
  }

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
