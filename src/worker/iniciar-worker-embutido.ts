import { criarEnviadorConversasNoto } from '../whatsapp/enviador-conversas-noto.js';
import { criarServicosIa } from '../ia/criar-servicos-ia.js';
import { iniciarAvisosPendenciasProfissionais } from './avisar-pendencias-profissionais.js';
import { PostgresDadosProfissionaisService } from '../io/postgres/postgres-dados-profissionais-service.js';
/**
 * Ciclo de execução embutido do worker de emissão de NFS-e.
 * Permite que a aplicação em container único (Easypanel/VPS) processe
 * a fila 'pronta' sem depender de um processo daemon separado ou cron externo.
 */

import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { AppConfig } from '../config.js';
import { PostgresFilaRepositorio } from '../io/postgres/postgres-fila-repositorio.js';
import { PostgresEmissorDpsService } from '../io/fiscal/postgres-emissor-dps-service.js';
import { MeuDanfeClient } from '../io/meudanfe/meu-danfe-client.js';
import { HubDesenvolvedorCpfClient } from '../io/hubdodesenvolvedor/hub-desenvolvedor-cpf-client.js';
import { EvolutionApiClient } from '../io/evolution/evolution-api-client.js';
import { createClient } from '@supabase/supabase-js';
import { SefinNacionalClient } from '../io/fiscal/sefin-nacional-client.js';
import { processarItemFila } from './processar-item-fila.js';
import { type NotificadorAlertas } from './notificar-erro-medico.js';

export function iniciarWorkerEmbutido(pool: pg.Pool, config: AppConfig) {
  const workerId = `embedded-${process.pid}-${randomUUID().slice(0, 6)}`;
  const filaRepo = new PostgresFilaRepositorio(pool, config.agenteFiscalAtivo);
  const meuDanfeClient = config.meuDanfeApiKey ? new MeuDanfeClient(config.meuDanfeApiKey) : undefined;
  const hubCpfClient = config.hubDesenvolvedorToken ? new HubDesenvolvedorCpfClient(config.hubDesenvolvedorToken) : undefined;
  const supabaseClient = config.supabaseUrl && config.supabaseServiceRoleKey
    ? createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
    : undefined;
  const sefinClient = new SefinNacionalClient();

  const emissorDps = new PostgresEmissorDpsService(
    pool,
    config.encryptionKey,
    meuDanfeClient,
    hubCpfClient,
    supabaseClient,
    sefinClient,
    config.agenteFiscalAtivo,
    config.preparacaoFiscalAtiva
  );
  const evolutionClient = new EvolutionApiClient(
    config.evolutionApiUrl,
    config.evolutionGlobalApiKey,
    config.evolutionOfficialInstanceName, config.evolutionOfficialInstanceName
  );

  const evolutionAssistantClient = new EvolutionApiClient(
    config.evolutionAssistantUrl,
    config.evolutionAssistantApiKey,
    config.evolutionAssistantInstanceName,
    config.evolutionOfficialInstanceName
  );
  const enviarConversas = criarEnviadorConversasNoto({
    oficialNome: config.evolutionOfficialInstanceName,
    assistenteNome: config.evolutionAssistantInstanceName,
    assistente: evolutionAssistantClient,
    clinicas: evolutionClient
  });
  const notificadorAlertas: NotificadorAlertas = {
    async notificarMedicoWhatsApp(params) {
      if (!params.medicoId || !params.solicitacaoId) {
        throw new Error('Identificadores do médico ou da solicitação ausentes para envio de notificação.');
      }
      try {
        const { rows } = await pool.query(
          `select u.telefone from medicos m join usuarios u on u.id = m.usuario_id where m.id = $1`,
          [params.medicoId]
        );
        if (rows[0]?.telefone) {
          await evolutionAssistantClient.enviarTexto({
            contatoTelefone: rows[0].telefone,
            texto: `Olá, Doutor(a). Identificamos uma ocorrência na emissão de NFS-e (solicitação ${params.solicitacaoId.slice(0, 8)}): ${params.motivoErro || 'Falha na comunicação com a prefeitura'}.`,
            instanciaNome: config.evolutionAssistantInstanceName
          });
        }
      } catch (err: any) {
        console.warn('[WorkerEmbutido] Falha ao enviar aviso de emissão ao médico:', err?.message || err);
      }
    },
    async notificarDesenvolvedorEmail(params) {
      if (config.resendApiKey && config.devEmailAlerta) {
        console.error(`[ALERTA DEV] ${params.assunto}: ${params.detalhesErro}`);
      }
    }
  };

  const dadosProfissionais = new PostgresDadosProfissionaisService(
    pool,
    enviarConversas,
    config.evolutionAssistantInstanceName,
    undefined,
    config.assistenteContextualAtivo,
    config.notoCadastroModo
  );
  const avisosProfissionais = iniciarAvisosPendenciasProfissionais(dadosProfissionais);
  let ativo = true;

  const loop = async () => {
    while (ativo) {
      try {
        const item = await filaRepo.buscarETravarProximoItem(workerId);
        if (!item) {
          await new Promise((resolve) => setTimeout(resolve, 5000));
          continue;
        }

        console.log(`[WorkerEmbutido] Processando solicitação ${item.id} (tentativa ${item.tentativas + 1})...`);
        const res = await processarItemFila(item, {
          filaRepositorio: filaRepo,
          dadosProfissionais,
          emissorDps,
          enviarPdfDanfse: evolutionClient,
          notificadorAlertas
        });
        console.log(`[WorkerEmbutido] Solicitação ${item.id} finalizada com status: ${res.status}`);
      } catch (err: any) {
        console.error('[WorkerEmbutido] Erro no ciclo de fila:', err?.message || err);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  };

  const execucao = loop();

  return {
    parar: async () => {
      ativo = false;
      avisosProfissionais.parar();
      await execucao;
    }
  };
}
