/**
 * Liga a conclusão do onboarding ao treino, sem bloquear a resposta da tela.
 * Estado e exclusão entre processos ficam no banco, não na memória do servidor.
 */
import type pg from 'pg';
import type { AppConfig } from '../../config.js';
import { enviarTreino } from '../treino/enviar-treino.js';
import { consultarStatusOnboarding } from '../io/consultar-status-onboarding.js';
import { PostgresTreinoRepositorio } from '../../io/postgres/postgres-treino-repositorio.js';
import { enviarMensagemTreino } from '../../io/evolution/enviar-mensagem-treino.js';

export function criarDisparadorTreino(pool: pg.Pool, config: AppConfig) {
  const repositorio = new PostgresTreinoRepositorio(pool);
  return (medicoId: string): void => {
    if (!config.treinoOnboardingAtivo) return;
    if (!config.evolutionApiUrl || !config.evolutionGlobalApiKey || !config.evolutionOfficialInstanceName) {
      console.warn('[TreinoOnboarding]', { medicoId, evento: 'integracao_indisponivel' });
      return;
    }
    void enviarTreino(medicoId, {
      repositorio,
      async consultarDestinatario(id) {
        const status = await consultarStatusOnboarding(pool, id, config.preparacaoFiscalAtiva);
        return { liberado: status.liberadoParaEmitir, telefone: status.telefone };
      },
      async enviar(telefone, mensagem) {
        const resultado = await enviarMensagemTreino({ baseUrl: config.evolutionApiUrl,
          apiKey: config.evolutionGlobalApiKey, instanciaOficial: config.evolutionOfficialInstanceName }, telefone, mensagem);
        console.info('[TreinoOnboarding]', { medicoId, evento: 'envio', ...resultado });
        return resultado;
      }
    }).catch(() => console.error('[TreinoOnboarding]', { medicoId, evento: 'falha_persistencia_ou_consulta' }));
  };
}
