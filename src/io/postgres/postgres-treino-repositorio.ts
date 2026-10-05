/**
 * A chave por médico e o UPDATE condicional coordenam instâncias concorrentes
 * do web. Envios incertos ficam parados para conferência, sem mensagens repetidas.
 */
import type pg from 'pg';
import type { TreinoRepositorio, ResultadoEnvioTreino } from '../../onboarding/treino/enviar-treino.js';
import { MENSAGENS_TREINO } from '../../onboarding/treino/mensagens-treino.js';

export class PostgresTreinoRepositorio implements TreinoRepositorio {
  constructor(private readonly pool: pg.Pool) {}

  async criar(medicoId: string): Promise<void> {
    await this.pool.query(`insert into onboarding_treinos_whatsapp (medico_id)
      values ($1) on conflict (medico_id) do nothing`, [medicoId]);
  }

  async reservarEtapa(medicoId: string): Promise<number | null> {
    const { rows } = await this.pool.query(`update onboarding_treinos_whatsapp
      set estado = 'enviando', atualizado_em = now(),
        eventos = eventos || jsonb_build_array(jsonb_build_object('acao', 'reservar', 'etapa', etapa, 'em', now()))
      where medico_id = $1 and versao = 1 and estado = 'pendente' and etapa < $2
      returning etapa`, [medicoId, MENSAGENS_TREINO.length]);
    return rows[0]?.etapa ?? null;
  }

  async registrarResultado(medicoId: string, etapa: number, resultado: ResultadoEnvioTreino): Promise<void> {
    const proxima = resultado.sucesso ? etapa + 1 : etapa;
    const estado = resultado.sucesso ? (proxima === MENSAGENS_TREINO.length ? 'concluido' : 'pendente')
      : (resultado.incerto ? 'incerto' : 'falha');
    const { rowCount } = await this.pool.query(`update onboarding_treinos_whatsapp
      set etapa = $3, estado = $4, atualizado_em = now(),
        eventos = eventos || jsonb_build_array($5::jsonb)
      where medico_id = $1 and versao = 1 and etapa = $2 and estado = 'enviando'`,
    [medicoId, etapa, proxima, estado, JSON.stringify({ acao: 'resultado', etapa, em: new Date().toISOString(), ...resultado })]);
    if (rowCount !== 1) throw new Error('Não foi possível registrar o resultado do treino.');
  }
}
