/**
 * A tomada de posse remove a solicitação da fila na mesma transação do caso.
 * Um caso único e uma reserva irreversível impedem repetir ações após crashes.
 */
import type pg from 'pg';
import type { ItemFilaComTentativas } from '../../worker/fila-repositorio.js';
import type { ContextoInvestigacao, EstadoInvestigacao, FalhaEmissao, InvestigacaoRepositorio } from '../../agente-fiscal/investigacao.js';

export class PostgresInvestigacaoRepositorio implements InvestigacaoRepositorio {
  constructor(private readonly pool: pg.Pool) {}

  async assumir(item: ItemFilaComTentativas, falha: FalhaEmissao): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const { rows } = await client.query(`select id from solicitacoes_nota
        where id = $1 and medico_id = $2 for update`, [item.id, item.medicoId]);
      if (!rows.length) throw new Error('Solicitação não pertence ao emitente');
      const caso = await client.query(`insert into investigacoes_emissao
        (solicitacao_id, medico_id, problema, eventos) values ($1, $2, $3, $4)
        on conflict (solicitacao_id) do nothing returning solicitacao_id`,
      [item.id, item.medicoId, JSON.stringify(falha), JSON.stringify([
        { tipo: 'problema_recebido', em: new Date().toISOString(), tentativa: item.tentativas + 1 }
      ])]);
      if (caso.rows.length) {
        // Mantém pendente: marcar erro/excecao permitiria criar outra solicitação
        // para as mesmas consultas antes de esclarecer a autorização remota.
        await client.query(`update solicitacoes_nota set fila = null,
          tentativas = greatest(tentativas, $3), erro = $4,
          bloqueada_em = null, bloqueada_por_worker = null
          where id = $1 and medico_id = $2`, [item.id, item.medicoId, item.tentativas + 1, falha.erro]);
      }
      await client.query('commit');
      return caso.rows.length > 0;
    } catch (erro) {
      await client.query('rollback');
      throw erro;
    } finally { client.release(); }
  }

  async consultar(item: ItemFilaComTentativas): Promise<ContextoInvestigacao> {
    const { rows } = await this.pool.query(`select s.status, s.tentativas,
      exists(select 1 from notas_fiscais n where n.solicitacao_id = s.id
        and n.medico_id = s.medico_id and n.status = 'autorizada') as autorizada,
      case when p.medico_id is null then null else jsonb_build_object(
        'municipio', p.cod_municipio_ibge, 'ambiente', p.ambiente,
        'simplesNacional', p.opcao_simples_nacional, 'regimeApuracao', p.regime_apuracao_sn,
        'serie', p.serie_dps) end as perfil, i.eventos as historico
      from solicitacoes_nota s
      join investigacoes_emissao i on i.solicitacao_id = s.id and i.medico_id = s.medico_id
      left join medico_perfil_fiscal p on p.medico_id = s.medico_id
      where s.id = $1 and s.medico_id = $2`, [item.id, item.medicoId]);
    if (!rows.length) throw new Error('Contexto de investigação indisponível');
    return rows[0];
  }

  async registrar(item: ItemFilaComTentativas, evento: Record<string, unknown>, estado?: EstadoInvestigacao): Promise<void> {
    const res = await this.pool.query(`update investigacoes_emissao
      set eventos = eventos || $3::jsonb, estado = coalesce($4, estado), atualizado_em = now()
      where solicitacao_id = $1 and medico_id = $2`,
    [item.id, item.medicoId, JSON.stringify([{ ...evento, em: new Date().toISOString() }]), estado ?? null]);
    if (res.rowCount !== 1) throw new Error('Investigação não encontrada');
  }

  async reservarTentativa(item: ItemFilaComTentativas, acao: 'tentar_novamente' | 'corrigir_tributos_federais' = 'tentar_novamente'): Promise<boolean> {
    const { rows } = await this.pool.query(`with reserva as (
      update investigacoes_emissao i set retentativas = 1, estado = 'tentando_resolver',
        atualizado_em = now(), eventos = eventos || jsonb_build_array(jsonb_build_object(
          'tipo', 'ferramenta', 'nome', $3::text, 'resultado', 'reservada', 'em', now()))
      where i.solicitacao_id = $1 and i.medico_id = $2 and i.retentativas = 0
        and i.estado = 'investigando'
        and (($3 = 'tentar_novamente'
          and i.problema->>'falhaAntesDoEnvio' in ('EAI_AGAIN', 'ECONNREFUSED')
          and i.problema->>'codigoErroSefin' is null)
          or ($3 = 'corrigir_tributos_federais'
          and i.problema->>'codigoErroSefin' = 'E0676'
          and i.problema->>'httpStatus' = '422'
          and i.problema->>'xmlDpsOriginal' is not null))
        and exists (select 1 from solicitacoes_nota s where s.id = i.solicitacao_id
          and s.medico_id = i.medico_id and s.status = 'pendente' and s.fila is null and s.tentativas < 3)
        and not exists (select 1 from notas_fiscais n where n.solicitacao_id = i.solicitacao_id)
      returning solicitacao_id)
      update solicitacoes_nota s set tentativas = tentativas + 1
      from reserva r where s.id = r.solicitacao_id returning s.id`, [item.id, item.medicoId, acao]);
    return rows.length === 1;
  }
}
