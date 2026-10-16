import { PostgresCadastro } from './cadastro/postgres-cadastro.js';
import { CadastroCertificado } from './cadastro/cadastro-certificado.js';
import { criarConsultaEmpresa, PesquisaRegistroIndisponivel } from './cadastro/consultas.js';
import { criarEnviadorConversasNoto } from './whatsapp/enviador-conversas-noto.js';
import { criarRouterStatusWhatsapp } from './whatsapp/status-router.js';
import { criarRouterCadastroPainel } from './cadastro/router-painel.js';
import { OpenSerpConsultaRegistro } from './cadastro/openserp-registro.js';
import { randomUUID } from 'node:crypto';
import { diagnosticoEntradaWebhook, diagnosticoResultadoWebhook, diagnosticoErroWebhook } from './whatsapp/diagnostico-webhook.js';
import { criarRouterNfse } from './api/nfse/nfse-router.js';
import { PostgresEmissaoApiRepositorio } from './io/postgres/postgres-emissao-api-repositorio.js';
import { PostgresCandidatosNotaRepositorio } from './agente-fiscal/io/postgres-candidatos-nota-repositorio.js';
import { AgendadorFechamentoFiscal } from './agente-fiscal/agendador/agendador-fechamento-fiscal.js';
import { PostgresCasosRepositorio } from './agente-fiscal/casos/repositorio.js';
import { LocalizadorCandidatos } from './agente-fiscal/casos/localizar-candidatos.js';
import { ServicoEmissaoCasos } from './agente-fiscal/casos/servico-emissao.js';
import { OrquestradorCasos } from './agente-fiscal/casos/orquestrador.js';
import { WorkerCasos } from './agente-fiscal/casos/worker.js';
import { NvidiaInterpretadorCaso } from './io/nvidia/interpretador-caso.js';
import { processarComandoFiscalMedico } from './agente-fiscal/fluxos/processar-comando-fiscal-medico.js';
import { iniciarOnboardingPosConexao } from './agente-fiscal/fluxos/iniciar-onboarding-pos-conexao.js';
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
import { salvarPreferenciasMedico } from './conta/salvar-preferencias-medico.js';
import { ZodError } from 'zod';
import { generateDanfsePdf } from './fiscal/danfse/gerar-danfse-pdf.js';
import { HubDesenvolvedorCpfClient } from './io/hubdodesenvolvedor/hub-desenvolvedor-cpf-client.js';
import { AdnNfseClient } from './io/fiscal/adn-nfse-client.js';
import { extrairChavesCertificado } from './io/fiscal/extrair-chaves-certificado.js';
import { carregarCertificadoMedico } from './io/fiscal/carregar-certificado-medico.js';
import { sincronizarHistoricoEvolutionUmaVez } from './onboarding/io/sincronizar-historico-evolution.js';
import { PostgresDadosProfissionaisService } from './io/postgres/postgres-dados-profissionais-service.js';
import { registrarConexaoWhatsapp } from './onboarding/io/registrar-conexao-whatsapp.js';
import { criarServicosIa } from './ia/criar-servicos-ia.js';
import { compararPerfilFiscal } from './onboarding/fluxos/comparar-perfil-fiscal.js';
import { PaligemmaComprovanteClient } from './io/nvidia/paligemma-comprovante-client.js';
import { configurarDesempenhoHttp, OPCOES_ARQUIVOS_ESTATICOS } from './http/configurar-desempenho-http.js';
import { tratarErrosHttp } from './http/tratar-erros-http.js';
import { criarEncerramentoGracioso } from './processo/encerrar-gracioso.js';
import { registrarSinaisDeProcesso } from './processo/registrar-sinais-de-processo.js';
import { GeminiComprovanteClient } from './candidatos/io/gemini-comprovante-client.js';
import { PostgresCandidatosRepositorio } from './candidatos/io/postgres-candidatos-repositorio.js';
import { processarRespostaMedicoCandidato } from './candidatos/fluxos/processar-resposta-medico-candidato.js';
import { processarSolicitacaoEmissaoApi } from './api/nfse/processar-solicitacao-emissao-api.js';
import { PostgresPedidosRepositorio } from './pedido-nota/io/postgres-pedidos-repositorio.js';
import { SupabaseFontePacientes } from './pedido-nota/io/supabase-fonte-pacientes.js';
import { SheetsFontePacientes } from './pedido-nota/io/sheets-fonte-pacientes.js';
import { ConversaFontePacientes } from './pedido-nota/io/conversa-fonte-pacientes.js';
import { GeminiPedidoClient } from './pedido-nota/io/gemini-pedido-client.js';
import { iniciarPedidoNota } from './pedido-nota/fluxos/iniciar-pedido-nota.js';
import { responderPedidoNota } from './pedido-nota/fluxos/responder-pedido-nota.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function criarAppExpress() {
  const app = express();
  configurarDesempenhoHttp(app);
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
  const evolutionClient = new EvolutionApiClient(
    config.evolutionApiUrl,
    config.evolutionGlobalApiKey,
    config.evolutionOfficialInstanceName, config.evolutionOfficialInstanceName
  );
  const evolutionAssistantClient = new EvolutionApiClient(
    config.evolutionAssistantUrl,
    config.evolutionAssistantApiKey,
    config.evolutionAssistantInstanceName, config.evolutionOfficialInstanceName
  );
  const paligemmaClient = new PaligemmaComprovanteClient(
    config.nvidiaApiKey || '',
    'https://ai.api.nvidia.com/v1/vlm/google/paligemma'
  );
  const ia = criarServicosIa(config);
  const enviarConversas=criarEnviadorConversasNoto({oficialNome:config.evolutionOfficialInstanceName,assistenteNome:config.evolutionAssistantInstanceName,assistente:evolutionAssistantClient,clinicas:evolutionClient});
  const dadosProfissionais = new PostgresDadosProfissionaisService(pool, enviarConversas, config.evolutionAssistantInstanceName, undefined, config.assistenteContextualAtivo, config.notoCadastroModo);
  const authAdminService = new SupabaseAuthAdminService(
    config.supabaseUrl,
    config.supabaseServiceRoleKey,
    pool
  );
  const hubCpfClient = config.hubDesenvolvedorToken
    ? new HubDesenvolvedorCpfClient(config.hubDesenvolvedorToken)
    : undefined;
  const pesquisaCrmConfigurada=!!config.openserpBaseUrl&&!!config.nvidiaApiKey;
  const consultaRegistro = pesquisaCrmConfigurada
    ? new OpenSerpConsultaRegistro({baseUrl:config.openserpBaseUrl,nvidiaApiKey:config.nvidiaApiKey,modelo:config.nvidiaRegistroModel,incluirDiagnostico:true})
    : new PesquisaRegistroIndisponivel();
  const cadastroCertificado = new CadastroCertificado(new PostgresCadastro(pool), criarConsultaEmpresa(config.hubDesenvolvedorToken), consultaRegistro,
    async (medicoId, certificadoId) => {
      const cert = await carregarCertificadoMedico(pool, authAdminService.supabaseClient, medicoId);
      if (!cert || cert.id !== certificadoId) return undefined;
      return extrairChavesCertificado(cert.pfxBuffer, cert.senhaCertificado).documentoTitular;
    }, hubCpfClient ? cpf => hubCpfClient.consultar(cpf) : undefined, pesquisaCrmConfigurada, 'openserp');
  if (process.env.NODE_ENV !== 'test') {
    const timer = setInterval(() => {
      // Enriquecimento automático via OpenSerp sem envio de perguntas no WhatsApp.
      void cadastroCertificado.recuperar().catch(() => console.warn('[Cadastro automático]', {codigo:'RECUPERACAO_FALHOU',acao:'verificar migrate:cadastro'}));
    }, 5000);
    timer.unref();
  }

  const adnNfseClient = new AdnNfseClient();
  const candidatosNotaRepo = new PostgresCandidatosNotaRepositorio(pool, config.appPepper, config.encryptionKey);
  const casosAtivos = process.env['AGENTE_FISCAL_CASOS_ATIVO'] === 'true';
  const casosRepo = new PostgresCasosRepositorio(pool);
  const emissaoCasos = new ServicoEmissaoCasos(pool, config.appPepper, config.encryptionKey);
  const orquestradorCasos = new OrquestradorCasos(casosRepo,
    new LocalizadorCandidatos(pool, paligemmaClient, evolutionClient, config.encryptionKey), emissaoCasos,
    new NvidiaInterpretadorCaso(config.nvidiaApiKey || '', config.nvidiaModel));
  const workerCasos = new WorkerCasos(pool, casosRepo, orquestradorCasos, emissaoCasos,
    evolutionAssistantClient, config.evolutionAssistantInstanceName);
  const solicitarVarreduraCasos = async (medicoId: string) => {
    const medico = await candidatosNotaRepo.obterDadosMedico(medicoId);
    if (!medico?.telefone || !medico.dadosProfissionaisConfirmados) return;
    await casosRepo.enfileirarEvento({ medicoId, instanciaNome: config.evolutionAssistantInstanceName,
      mensagemId: `varredura:${medicoId}:${Math.floor(Date.now() / 60000)}`,
      payload: { tarefa: 'varrer', telefone: medico.telefone } });
  };
  const agendadorFechamentoFiscal = new AgendadorFechamentoFiscal({
    pool,
    pepper: config.appPepper,
    chaveCriptografia: config.encryptionKey,
    repositorio: candidatosNotaRepo,
    enviarMensagem: evolutionAssistantClient,
    instanciaNome: config.evolutionAssistantInstanceName,
    solicitarVarredura: casosAtivos ? solicitarVarreduraCasos : undefined,
    horariosTexto: process.env['AGENTE_FISCAL_HORARIOS'] || '12:00,18:00',
    ativo: Boolean(config.agenteFiscalAtivo),
    comprovanteClient: paligemmaClient,
    evolutionClient
  });
  if (casosAtivos && process.env['NODE_ENV'] !== 'test') {
    agendadorFechamentoFiscal.iniciar();
    workerCasos.iniciar();
  }

  const sincronizarHistoricoInstancia = (nomeInstancia: string) =>
    sincronizarHistoricoEvolutionUmaVez({
      baseUrl: config.evolutionApiUrl,
      apiKey: config.evolutionGlobalApiKey,
      nomeInstancia,
      repositorio: atendimentoRepo,
      consultaCpfProvider: hubCpfClient,
      pepper: config.appPepper
    });

  const dispararOnboardingFiscal = (medicoId: string) => {
    void (async () => {
      const res = await pool.query(
        "SELECT nome_instancia FROM whatsapp_instancias WHERE medico_id = $1 AND oficial = false AND status = 'conectado' LIMIT 1",
        [medicoId]
      );
      const nomeInstancia = res.rows[0]?.nome_instancia || '';
      if (!nomeInstancia) return;
      await iniciarOnboardingPosConexao({
        medicoId,
        nomeInstancia,
        repositorio: candidatosNotaRepo,
        enviarMensagemAssistente: evolutionAssistantClient,
        instanciaAssistenteNome: config.evolutionAssistantInstanceName,
        sincronizarHistorico: sincronizarHistoricoInstancia,
        solicitarVarredura: casosAtivos ? solicitarVarreduraCasos : undefined,
        comprovanteClient: paligemmaClient,
        evolutionClient
      });
    })().catch(err => console.error('[Onboarding Fiscal]', err));
  };

  // Healthcheck para o Easypanel
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api/conta/cadastro', criarRouterCadastroPainel({
    pool,repo:cadastroCertificado.repo,
    autenticar: async token => { const { data,error } = await authAdminService.supabaseClient.auth.getUser(token);return error?null:data.user?.id??null; },
    aoAprovarProfissional: dispararOnboardingFiscal,
    processarPendentes: () => cadastroCertificado.recuperar()
  }));
  app.use('/api/whatsapp', criarRouterStatusWhatsapp({
    pool,
    autenticar: async token => { const { data, error } = await authAdminService.supabaseClient.auth.getUser(token); return error ? null : data.user?.id ?? null; },
    consultar: medicoId => consultarStatusInstanciaWhatsapp(pool, {
      medicoId, evolutionUrl: config.evolutionApiUrl, evolutionApiKey: config.evolutionGlobalApiKey,
      aoConectar: dispararOnboardingFiscal
    })
  }));

  // API de Emissão de NFS-e (compatível com Focus NFe + Zero-Config)
  const emissaoApiRepo = new PostgresEmissaoApiRepositorio(pool, config.encryptionKey, config.appPepper);
  const geminiComprovanteClient = new GeminiComprovanteClient(
    config.geminiApiKey || '',
    config.geminiModel
  );
  const candidatosRepo = new PostgresCandidatosRepositorio(
    pool,
    config.appPepper,
    config.encryptionKey
  );
  const pedidosRepo = new PostgresPedidosRepositorio(
    pool,
    config.appPepper,
    config.encryptionKey
  );
  const supabaseFonte = new SupabaseFontePacientes(
    pool,
    config.appPepper,
    config.encryptionKey
  );
  const sheetsFonte = new SheetsFontePacientes(
    pool,
    config.encryptionKey,
    config.googleClientId,
    config.googleClientSecret
  );
  const conversaFonte = new ConversaFontePacientes(
    pool,
    config.encryptionKey
  );
  const geminiPedidoClient = new GeminiPedidoClient(
    config.geminiApiKey || '',
    config.geminiModel
  );
  const routerNfse = criarRouterNfse({
    repositorio: emissaoApiRepo,
    autenticar: async token => {
      const { data, error } = await authAdminService.supabaseClient.auth.getUser(token);
      if (!error && data.user?.id) {
        return resolverMedicoId(pool, data.user.id).catch(() => null);
      }
      return resolverMedicoId(pool, token).catch(() => null);
    }
  });
  app.use('/api/v1/nfse', routerNfse);
  app.use('/v2/nfse', routerNfse);
  app.use('/v2/nfsen', routerNfse);

  // UI Web de Entrada e Assets Estáticos
  app.use('/assets', express.static(join(__dirname, 'assets'), OPCOES_ARQUIVOS_ESTATICOS));
  app.get('/', (_req: Request, res: Response) => {
    res.sendFile(join(__dirname, 'ui', 'index.html'));
  });

  // Páginas institucionais simples (Google Console)
  app.get('/sobre', (_req: Request, res: Response) => {
    res.sendFile(join(__dirname, 'ui', 'sobre.html'));
  });
  app.get('/termos', (_req: Request, res: Response) => {
    res.sendFile(join(__dirname, 'ui', 'termos.html'));
  });
  app.get('/privacidade', (_req: Request, res: Response) => {
    res.sendFile(join(__dirname, 'ui', 'privacidade.html'));
  });
  app.get('/docs', (_req: Request, res: Response) => {
    res.sendFile(join(__dirname, 'ui', 'docs.html'));
  });
  app.get('/llms.txt', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.sendFile(join(__dirname, 'ui', 'llms.txt'));
  });

  // Verificação de propriedade do domínio no Google Search Console
  app.get('/google7e12f4f1b60db1c4.html', (_req: Request, res: Response) => {
    res.sendFile(join(__dirname, 'ui', 'google7e12f4f1b60db1c4.html'));
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
      const token = req.headers.authorization?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) return res.status(401).json({ ok: false, detalhe: 'Autenticação necessária' });
      const { data: identidade, error: erroAuth } = await authAdminService.supabaseClient.auth.getUser(token);
      if (erroAuth || !identidade.user) return res.status(401).json({ ok: false, detalhe: 'Sessão inválida' });
      const medicoId = await resolverMedicoId(pool, medicoIdRaw);
      const vinculo = await pool.query(
        'select m.id from medicos m join usuarios u on u.id = m.usuario_id where m.id = $1 and u.auth_user_id = $2 and u.ativo = true',
        [medicoId, identidade.user.id]
      );
      if (!vinculo.rowCount) return res.status(403).json({ ok: false, detalhe: 'Cadastro não autorizado' });
      res.setHeader('Cache-Control', 'no-store');
      let status = await consultarStatusOnboarding(pool, medicoId, config.preparacaoFiscalAtiva);
      // Reconcile an outdated local record before asking an already linked user to pair again.
      if (status.passos.passo3CertificadoValido && !status.passos.passo4WhatsappConectado) {
        const conexao = await consultarStatusInstanciaWhatsapp(pool, {
          medicoId,
          evolutionUrl: config.evolutionApiUrl,
          evolutionApiKey: config.evolutionGlobalApiKey,
          aoConectar: dispararOnboardingFiscal
        });
        if (conexao.ok && conexao.conectado) {
          status = await consultarStatusOnboarding(pool, medicoId, config.preparacaoFiscalAtiva);
        }
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
      dispararOnboardingFiscal(medicoIdFinal);
      return res.json({ ok: true, ...perfil });
    } catch (err: any) {
      if (err instanceof ZodError) return res.status(400).json({ ok: false, detalhe: err.issues[0]?.message });
      if (err?.code === '23505') return res.status(409).json({ ok: false, detalhe: 'Este e-mail já está associado a outra conta.' });
      if (err instanceof ErroPerfilProfissional) return res.status(400).json({ ok: false, detalhe: err.message });
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao atualizar perfil' });
    }
  });

  // Atualizar Preferências do Médico (ex: solicitar CPF direto para o paciente ou médico)
  app.post('/api/conta/preferencias', async (req: Request, res: Response) => {
    try {
      const { usuarioId, medicoId: medicoIdRaw, solicitarCpfDiretoPaciente } = req.body || {};
      const medicoIdFinal = await resolverMedicoId(pool, medicoIdRaw || usuarioId);
      const resultado = await salvarPreferenciasMedico(pool, {
        medicoId: medicoIdFinal,
        solicitarCpfDiretoPaciente: Boolean(solicitarCpfDiretoPaciente)
      });
      return res.json({ ok: true, ...resultado });
    } catch (err: any) {
      return res.status(400).json({ ok: false, detalhe: err?.message || 'Erro ao salvar preferências' });
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
      const fiscal = await processarOnboardingXml({
        pool, supabase: authAdminService.supabaseClient,
        documentoTitularEsperado: titular.documentoTitular, chaveCriptografia: config.encryptionKey, pepperCpf: config.appPepper
      },
        medicoId, consulta.documento.xml);
      const adocaoFiscal = await adotarReferenciaConsentida({ pool, preparacaoFiscalAtiva: Boolean(config.preparacaoFiscalAtiva) },
        medicoId, fiscal.parametros.dadosReformaTributaria.hash);

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

      return res.json({ ok: true, mensagem: 'Parâmetros fiscais confirmados com sucesso', medicoId });
    } catch (err: any) {
      if (req.body?.usarReferencia === true) {
        console.warn('[Fiscal] Adoção da referência pendente:', { codigo: err?.codigo || 'CONFIRMACAO_FALHOU', diagnostico: err?.diagnostico, mensagem: err?.message });
        if (err instanceof ErroAdocaoReferencia) return res.status(400).json({ ok: false, codigo: err.codigo, detalhe: err.message });
        return res.status(400).json({ ok: false, detalhe: 'Ainda não conseguimos adotar a configuração completa dessa nota. Busque a referência novamente; se persistir, a equipe precisa analisar o caso antes de liberar a emissão.' });
      }
      return res.status(400).json({
        ok: false, detalhe: Array.isArray(err?.issues)
          ? err.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join('; ')
          : err?.message || 'Erro ao confirmar parâmetros fiscais'
      });
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

      if (config.notoCadastroModo === 'confirmacao') {
        void cadastroCertificado.agendar({medicoId, certificadoId:resultado.certificadoId, documentoTitular})
          .then(() => cadastroCertificado.recuperar())
          .catch(() => console.warn('[Cadastro automático]', {codigo:'AGENDAMENTO_FALHOU'}));
      }

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
      const revisaoProfissional = await cadastroCertificado.repo.revisaoPainel(medicoId);
      if (!revisaoProfissional.aprovado) return res.status(409).json({ ok: false,
        codigo: 'DADOS_PROFISSIONAIS_PENDENTES', detalhe: 'Revise e aprove seus dados profissionais antes de conectar o WhatsApp.' });

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
        webhookSecret: config.evolutionWebhookSecret,
        aoConectar: dispararOnboardingFiscal
      });

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
        evolutionApiKey: config.evolutionGlobalApiKey,
        aoConectar: dispararOnboardingFiscal
      });

      return res.json({ ...resultado, medicoId });
    } catch (err: any) {
      return res.status(500).json({ ok: false, detalhe: err?.message || 'Erro ao consultar status do WhatsApp' });
    }
  });

  // Rota Webhook da Evolution API (suporta rota direta e subrotas com eventos)
  const webhookHandler = async (req: Request, res: Response) => {
    const referencia = randomUUID(), inicio = Date.now();
    console.info('[Webhook Evolution]', { etapa: 'recebido', referencia, ...diagnosticoEntradaWebhook(req.body) });
    try {
      const tokenRecebido =
        (req.headers['apikey'] as string) ||
        (req.headers['x-webhook-secret'] as string) ||
        (req.headers['authorization'] as string) ||
        (req.query['secret'] as string) ||
        (req.query['apikey'] as string) ||
        (req.query['token'] as string);

      // Autentica com segredo do webhook ou API key global da Evolution (oficial ou assistente)
      let segredoEsperado = config.evolutionWebhookSecret;
      if (
        tokenRecebido &&
        (tokenRecebido === config.evolutionGlobalApiKey ||
          tokenRecebido === config.evolutionWebhookSecret ||
          tokenRecebido === config.evolutionAssistantApiKey ||
          tokenRecebido === config.evolutionAssistantWebhookSecret)
      ) {
        segredoEsperado = tokenRecebido;
      }

      const resultado = await processarMensagemWebhook(req.body, tokenRecebido, {
        repositorio: atendimentoRepo,
        dadosProfissionais,
        enviarMensagemPaciente: enviarConversas,
        iaService: ia.extrator,
        comprovanteClient: paligemmaClient,
        evolutionClient,
        consultaCpfProvider: hubCpfClient,
        segredoConfigurado: segredoEsperado,
        pepper: config.appPepper,
        instanciaOficialNome: config.evolutionOfficialInstanceName,
        instanciaAssistenteNome: config.evolutionAssistantInstanceName,
        enviarMensagemAssistente: evolutionAssistantClient,
        modoCadastro: config.notoCadastroModo,
        candidatosPipeline: casosAtivos ? undefined : {
          geminiClient: geminiComprovanteClient,
          candidatosRepo,
          enviarMensagemAoMedico: async (tel, texto) => {
            const res = await evolutionAssistantClient.enviarTexto({
              instanciaNome: config.evolutionAssistantInstanceName,
              contatoTelefone: tel,
              texto
            });
            return res.sucesso;
          }
        },
        processarComandoFiscal: async (medicoId, texto, telefone, mensagem) => {
          if (casosAtivos) {
            const perfilProfissional = await candidatosNotaRepo.obterDadosMedico(medicoId);
            if (!perfilProfissional?.dadosProfissionaisConfirmados) return { tratado: true, detalhe: { estado: 'aguardando_confirmacao_profissional' } };
            if (!mensagem?.id) throw new Error('MENSAGEM_SEM_IDENTIDADE');
            const casoRecebido = await casosRepo.obterAtivo(medicoId);
            await casosRepo.enfileirarEvento({ medicoId, instanciaNome: config.evolutionAssistantInstanceName,
              mensagemId: mensagem.id, payload: { texto, telefone, mensagemCitadaId: mensagem.citadaId, instanteMensagem: mensagem.instante,
                casoRecebidoId: casoRecebido?.id ?? null,
                perguntaRecebidaId: casoRecebido?.perguntaPendente?.mensagemId ?? null } });
            return { tratado: true, detalhe: { estado: 'recebido' } };
          }
          const enviarAoMedico = async (tel: string, txt: string) => {
            const res = await evolutionAssistantClient.enviarTexto({
              instanciaNome: config.evolutionAssistantInstanceName,
              contatoTelefone: tel,
              texto: txt
            });
            return res.sucesso;
          };

          const enviarAoPaciente = async (tel: string, txt: string) => {
            const res = await enviarConversas.enviarTexto({
              instanciaNome: config.evolutionOfficialInstanceName,
              contatoTelefone: tel,
              texto: txt
            });
            return res.sucesso;
          };

          // 1. Resposta do médico a um pedido de nota ativo
          const resRespostaPedido = await responderPedidoNota(
            { medicoId, texto, telefoneMedico: telefone },
            {
              repositorio: pedidosRepo,
              emissaoApiRepo,
              processarEmissaoApi: processarSolicitacaoEmissaoApi,
              enviarMensagemAoMedico: enviarAoMedico
            }
          );
          if (resRespostaPedido.tratado) {
            return { tratado: true, detalhe: resRespostaPedido };
          }

          // 2. Resposta do médico a um candidato de comprovante pendente
          const resCandidato = await processarRespostaMedicoCandidato(
            { medicoId, textoRecebido: texto, telefoneMedico: telefone },
            {
              repositorio: candidatosRepo,
              emissaoApiRepo,
              processarEmissaoApi: processarSolicitacaoEmissaoApi,
              enviarMensagemAoMedico: enviarAoMedico,
              enviarMensagemAoPaciente: enviarAoPaciente
            }
          );
          if (resCandidato.tratado) {
            return { tratado: true, detalhe: resCandidato };
          }

          // 3. Novo pedido sob demanda solicitado pelo médico (ex: "emite a nota do Antônio")
          const resNovoPedido = await iniciarPedidoNota(
            { medicoId, mensagemId: randomUUID(), texto, telefoneMedico: telefone },
            {
              repositorio: pedidosRepo,
              fontesPacientes: [supabaseFonte, sheetsFonte, conversaFonte],
              geminiClient: geminiPedidoClient,
              consultaCpfProvider: hubCpfClient,
              enviarMensagemAoMedico: enviarAoMedico
            }
          );
          if (resNovoPedido.tratado) {
            return { tratado: true, detalhe: resNovoPedido };
          }

          return processarComandoFiscalMedico(medicoId, texto, telefone, {
            repositorio: candidatosNotaRepo,
            enviarMensagem: evolutionAssistantClient,
            instanciaNome: config.evolutionAssistantInstanceName,
            comprovanteClient: paligemmaClient,
            evolutionClient
          });
        },
        async aoAtualizarConexao(evento) {
          if (
            evento.instancia === config.evolutionOfficialInstanceName ||
            evento.instancia === config.evolutionAssistantInstanceName
          ) return;
          const medicoId = await registrarConexaoWhatsapp(pool, evento);
          if (medicoId && evento.state === 'open') {
            void iniciarOnboardingPosConexao({
              medicoId,
              nomeInstancia: evento.instancia,
              repositorio: candidatosNotaRepo,
              enviarMensagemAssistente: evolutionAssistantClient,
              instanciaAssistenteNome: config.evolutionAssistantInstanceName,
              sincronizarHistorico: sincronizarHistoricoInstancia,
              solicitarVarredura: casosAtivos ? solicitarVarreduraCasos : undefined,
              comprovanteClient: paligemmaClient,
              evolutionClient
            }).catch(err => console.warn('[Onboarding Pós-Conexão] Falha:', err?.message || err));
          }
        }
      });

      console.info('[Webhook Evolution]', { etapa: 'concluido', referencia, duracaoMs: Date.now() - inicio, ...diagnosticoResultadoWebhook(resultado) });
      if (!resultado.ok) {
        const status = resultado.motivo === 'autenticacao_invalida' ? 401 : 400;
        return res.status(status).json(resultado);
      }

      return res.json(resultado);
    } catch (erro) {
      console.error('[Webhook Evolution]', { etapa: 'falha', referencia, duracaoMs: Date.now() - inicio, ...diagnosticoErroWebhook(erro) });
      return res.status(500).json({ ok: false, motivo: 'falha_processamento', referencia });
    }
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

  // Rota de Extração Inteligente de Dados com NVIDIA
  app.post('/api/ia/extrair-dados', async (req: Request, res: Response) => {
    try {
      const { texto, mensagens, dataReferencia } = req.body || {};
      const textoConsulta = texto || (Array.isArray(mensagens) ? mensagens.join('\n') : '');
      if (!textoConsulta) {
        return res.status(400).json({ ok: false, detalhe: 'Texto ou mensagens são obrigatórios' });
      }
      const dataRef = dataReferencia ? new Date(dataReferencia) : new Date();
      const resultado = await ia.extrator.extrairDados(textoConsulta, dataRef);
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

  if (process.env['NODE_ENV'] !== 'test') {
    setTimeout(() => {
      void pool.query(
        `select nome_instancia, medico_id
         from whatsapp_instancias
         where status = 'conectado' and oficial = false`
      ).then(async ({ rows }) => {
        for (const row of rows) {
          try {
            const resultado = await sincronizarHistoricoInstancia(row.nome_instancia);
            console.info('[Evolution] Histórico recuperado ao iniciar:', resultado);
            if (casosAtivos && row.medico_id) {
              await solicitarVarreduraCasos(row.medico_id);
            }
          } catch (erro: any) {
            console.warn('[Evolution] Histórico não recuperado ao iniciar:', erro?.message || erro);
          }
        }
      }).catch((erro: any) => {
        console.warn('[Evolution] Falha ao listar instâncias para histórico:', erro?.message || erro);
      });
    }, 5_000);
  }

  app.use(tratarErrosHttp);

  return app;
}

import { iniciarWorkerEmbutido } from './worker/iniciar-worker-embutido.js';

// Inicia servidor quando executado diretamente
if (process.env['NODE_ENV'] !== 'test') {
  const app = criarAppExpress();
  const servidor = app.listen(config.porta, config.host, () => {
    console.log(`[Notomed Whats] Servidor rodando em http://${config.host}:${config.porta}`);
  });
  servidor.on('error', (erro) => {
    console.error(`[Notomed Whats] Falha ao abrir ${config.host}:${config.porta}:`, erro.message);
    process.exit(1);
  });

  // Inicia worker da fila em segundo plano no mesmo container
  const worker = iniciarWorkerEmbutido(pool, config);
  console.log('[Notomed Whats] Worker de fila NFS-e iniciado com sucesso.');

  registrarSinaisDeProcesso(process, criarEncerramentoGracioso({
    fecharServidor: () => new Promise<void>((resolver) => {
      servidor.close(() => resolver());
      servidor.closeIdleConnections();
    }),
    pararWorker: () => worker.parar(),
    fecharPool: () => pool.end()
  }, { tempoLimiteMs: 8_000, sair: (codigo) => process.exit(codigo) }));
}
