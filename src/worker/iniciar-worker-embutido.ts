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
import { EvolutionApiClient } from '../io/evolution/evolution-api-client.js';
import { processarItemFila } from './processar-item-fila.js';
import type { NotificadorAlertas } from './notificar-erro-medico.js';

export function iniciarWorkerEmbutido(pool: pg.Pool, config: AppConfig) {
  const workerId = `embedded-${process.pid}-${randomUUID().slice(0, 6)}`;
  const filaRepo = new PostgresFilaRepositorio(pool);
  const emissorDps = new PostgresEmissorDpsService(pool, config.encryptionKey);
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

  loop();

  return {
    parar: () => {
      ativo = false;
    }
  };
}
