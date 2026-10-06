/**
 * A chave por médico e o UPDATE condicional coordenam instâncias concorrentes
 * do web. Envios incertos ficam parados para conferência, sem mensagens repetidas.
 */
import type pg from 'pg';
import type { TreinoRepositorio, ResultadoEnvioTreino } from '../../onboarding/treino/enviar-treino.js';
import { MENSAGENS_TREINO, MENSAGENS_TREINO_LEGADO, type MensagemTreino } from '../../onboarding/treino/mensagens-treino.js';

export class PostgresTreinoRepositorio implements TreinoRepositorio {
  constructor(private readonly pool: pg.Pool) {}

  async criar(medicoId: string): Promise<void> {
    await this.pool.query(`insert into onboarding_treinos_whatsapp (medico_id, eventos)
      values ($1, $2::jsonb) on conflict (medico_id) do nothing`,
      [medicoId, JSON.stringify([{ acao: 'roteiro', mensagens: MENSAGENS_TREINO }])]);
  }

  async reservarEtapa(medicoId: string): Promise<{ etapa: number; mensagem: MensagemTreino } | null> {
    const { rows } = await this.pool.query(`update onboarding_treinos_whatsapp
      set estado = 'enviando', atualizado_em = now(),
        eventos = eventos || jsonb_build_array(jsonb_build_object('acao', 'reservar', 'etapa', etapa, 'em', now()))
      where medico_id = $1 and versao = 1 and estado = 'pendente' and etapa < coalesce(
        (select jsonb_array_length(e->'mensagens') from jsonb_array_elements(eventos) e where e->>'acao' = 'roteiro' limit 1), $2)
      returning etapa, eventos`, [medicoId, MENSAGENS_TREINO_LEGADO.length]);
    if (!rows[0]) return null;
    const roteiro = rows[0].eventos.find((e: any) => e.acao === 'roteiro')?.mensagens || MENSAGENS_TREINO_LEGADO;
    return { etapa: rows[0].etapa, mensagem: roteiro[rows[0].etapa] };
  }

  async registrarResultado(medicoId: string, etapa: number, resultado: ResultadoEnvioTreino): Promise<void> {
    const proxima = resultado.sucesso ? etapa + 1 : etapa;
    const estado = resultado.sucesso ? 'pendente'
      : (resultado.incerto ? 'incerto' : 'falha');
    const { rowCount } = await this.pool.query(`update onboarding_treinos_whatsapp
      set etapa = $3, estado = case when $4 = 'pendente' and $3 >= coalesce(
        (select jsonb_array_length(e->'mensagens') from jsonb_array_elements(eventos) e where e->>'acao' = 'roteiro' limit 1), $6)
        then 'concluido' else $4 end, atualizado_em = now(),
        eventos = eventos || jsonb_build_array($5::jsonb)
      where medico_id = $1 and versao = 1 and etapa = $2 and estado = 'enviando'`,
    [medicoId, etapa, proxima, estado, JSON.stringify({ acao: 'resultado', etapa, em: new Date().toISOString(), ...resultado }), MENSAGENS_TREINO_LEGADO.length]);
    if (rowCount !== 1) throw new Error('Não foi possível registrar o resultado do treino.');
  }
}
