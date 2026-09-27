/**
 * Processo de background (daemon) que executa o Worker da fila de emissão de NFS-e.
 * Consome periodicamente `solicitacoes_nota` com `fila = 'pronta'` na VPS,
 * aplicando lock otimista e retentativas automáticas (seção 1 e 3.2 do plano).
 */

import { randomUUID } from 'node:crypto';
import { config } from './config.js';
import { pool } from './io/postgres/pool.js';
import { PostgresFilaRepositorio } from './io/postgres/postgres-fila-repositorio.js';
import { PostgresEmissorDpsService } from './io/fiscal/postgres-emissor-dps-service.js';
import { MeuDanfeClient } from './io/meudanfe/meu-danfe-client.js';
import { EvolutionApiClient } from './io/evolution/evolution-api-client.js';
import { processarItemFila } from './worker/processar-item-fila.js';
import type { NotificadorAlertas } from './worker/notificar-erro-medico.js';

const workerId = `worker-${process.pid}-${randomUUID().slice(0, 6)}`;
const filaRepo = new PostgresFilaRepositorio(pool);
const meuDanfeClient = config.meuDanfeApiKey ? new MeuDanfeClient(config.meuDanfeApiKey) : undefined;
const emissorDps = new PostgresEmissorDpsService(pool, config.encryptionKey, meuDanfeClient);
const evolutionClient = new EvolutionApiClient(
  config.evolutionApiUrl,
  config.evolutionGlobalApiKey,
  config.evolutionOfficialInstanceName
);

const notificadorAlertas: NotificadorAlertas = {
  async notificarMedicoWhatsApp(params) {
    const texto = `⚠️ Aviso de Emissão: Não foi possível emitir a NFS-e. Motivo: ${params.motivoErro}`;
    await evolutionClient.enviar({ telefone: params.telefoneMedico, codigo: texto });
  },
  async notificarDesenvolvedorEmail(params) {
    if (config.resendApiKey && config.devEmailAlerta) {
      console.error(`[ALERTA DEV] ${params.assunto}: ${params.detalhesErro}`);
    }
  }
};

let executando = true;

async function cicloWorker() {
  console.log(`[Worker ${workerId}] Iniciando monitoramento da fila de NFS-e...`);

  while (executando) {
    try {
      const item = await filaRepo.buscarETravarProximoItem(workerId);
      if (item) {
        console.log(`[Worker ${workerId}] Processando solicitação ${item.id} (tentativa ${item.tentativas + 1})...`);
        const res = await processarItemFila(item, {
          filaRepositorio: filaRepo,
          emissorDps,
          enviarPdfDanfse: evolutionClient,
          notificadorAlertas
        });
        console.log(`[Worker ${workerId}] Solicitação ${item.id} finalizada com status: ${res.status}`);
      } else {
        // Sem itens prontos no momento, aguarda 5 segundos
        await new Promise((r) => setTimeout(r, 5000));
      }
    } catch (err: any) {
      console.error(`[Worker ${workerId}] Erro no ciclo da fila:`, err.message);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

process.on('SIGINT', () => {
  console.log(`[Worker ${workerId}] Encerrando graciosamente...`);
  executando = false;
  process.exit(0);
});

process.on('SIGTERM', () => {
  executando = false;
  process.exit(0);
});

cicloWorker();
