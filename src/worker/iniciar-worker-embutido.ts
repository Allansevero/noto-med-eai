import { PostgresComunicadorNoto } from '../io/postgres/postgres-comunicador-noto.js';
import { criarServicosIa } from '../ia/criar-servicos-ia.js';
import { iniciarAvisosPendenciasProfissionais } from './avisar-pendencias-profissionais.js';
import { PostgresDadosProfissionaisService } from '../io/postgres/postgres-dados-profissionais-service.js';
/**
 * Ciclo de execução embutido do worker de emissão de NFS-e.
 * Permite que a aplicação em container único (Easypanel/VPS) processe
 * a fila 'pronta' sem depender de um processo daemon separado ou cron externo.
 */

import { PostgresInvestigacaoRepositorio } from '../io/postgres/postgres-investigacao-repositorio.js';

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
    config.evolutionOfficialInstanceName
  );

  const ia = criarServicosIa(config);
  const comunicadorNoto = new PostgresComunicadorNoto(pool, evolutionClient, config.evolutionOfficialInstanceName, ia.geradorMensagem);
  const notificadorAlertas: NotificadorAlertas = {
    async notificarMedicoWhatsApp(params) {
      if(!params.medicoId || !params.solicitacaoId)return;
      const envio=await comunicadorNoto.enviar({medicoId:params.medicoId,solicitacaoId:params.solicitacaoId,
        chave:`falha:${params.solicitacaoId}`,evento:'falha_emissao',dados:{diagnostico:params.motivoErro}});
      if(!envio.sucesso)console.warn('[NotoConversa] Aviso de emissão aguardando comunicação.',{solicitacaoId:params.solicitacaoId});
    },
    async notificarDesenvolvedorEmail(params) {
      if (config.resendApiKey && config.devEmailAlerta) {
        console.error(`[ALERTA DEV] ${params.assunto}: ${params.detalhesErro}`);
      }
    }
  };

  const dadosProfissionais = new PostgresDadosProfissionaisService(pool, evolutionClient, config.evolutionOfficialInstanceName, comunicadorNoto);
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
          notificadorAlertas,
          agenteFiscal: config.agenteFiscalAtivo ? {
            repositorio: new PostgresInvestigacaoRepositorio(pool),
            decisor: ia.decisorFiscal
          } : undefined
        });
        console.log(`[WorkerEmbutido] Solicitação ${item.id} finalizada com status: ${res.status}`);
      } catch (err: any) {
        console.error('[WorkerEmbutido] Erro no ciclo de fila:', err?.message || err);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  };

  loop();

  return {
    parar: () => {
      ativo = false;
      avisosProfissionais.parar();
    }
  };
}
