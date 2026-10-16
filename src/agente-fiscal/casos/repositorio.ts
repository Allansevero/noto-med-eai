import type pg from 'pg';
import type { CandidatoNotaFiscal } from '../regras/correlacionar-consulta-pagamento.js';
import type { AtualizacaoCasoFiscal, CasoFiscal, EventoAgente, NovoEventoAgente } from './modelo.js';

const CAMPOS_CASO = `id, medico_id as "medicoId", mensagem_pagamento_id as "mensagemPagamentoId",
  candidato, estado, revisao, solicitacao_id as "solicitacaoId", pergunta_pendente as "perguntaPendente",
  dados, adiado_ate as "adiadoAte", criado_em as "criadoEm", atualizado_em as "atualizadoEm"`;
const CAMPOS_EVENTO = `id, medico_id as "medicoId", instancia_nome as "instanciaNome",
  mensagem_id as "mensagemId", tipo, payload, tentativas, token_lease as "tokenLease"`;

/** Inbox com reentrega idempotente; saídas incertas exigem reconciliação antes de reenviar. */
export class PostgresCasosRepositorio {
  constructor(private readonly pool: pg.Pool) {}

  async criarOuObter(medicoId: string, candidato: CandidatoNotaFiscal): Promise<CasoFiscal> {
    const mensagemId = candidato.origemEvidencia.mensagemPagamentoId;
    if (!mensagemId?.trim()) throw new Error('Pagamento sem identidade de mensagem');
    const identidade = candidato.identidadePagamento || `mensagem:${mensagemId}`;
    return this.transacao(async db => {
      await db.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [`casos:${medicoId}`]);
      const anterior = await db.query<CasoFiscal>(`select ${CAMPOS_CASO} from agente_fiscal_casos
        where medico_id=$1 and (mensagem_pagamento_id=$2 or identidade_pagamento=$3) for update`,
      [medicoId, mensagemId, identidade]);
      if (anterior.rows[0]) {
        await db.query('update agente_fiscal_casos set identidade_pagamento=coalesce(identidade_pagamento,$2) where id=$1',
          [anterior.rows[0].id, identidade]);
        return anterior.rows[0];
      }
      const legado = await db.query(`select id,status,fila,aguardando_confirmacao_medico,aguardando_cpf_medico
        from solicitacoes_nota where medico_id=$1 and referencia_externa=$2 for update`, [medicoId, mensagemId]);
      const solicitacao = legado.rows[0];
      const estado = !solicitacao ? 'em_revisao' : solicitacao.status === 'emitida' ? 'emitido'
        : solicitacao.aguardando_cpf_medico ? 'aguardando_dados'
        : solicitacao.aguardando_confirmacao_medico ? 'aguardando_aprovacao' : 'enfileirado';
      const { rows } = await db.query<CasoFiscal>(`
        insert into agente_fiscal_casos (medico_id,mensagem_pagamento_id,identidade_pagamento,candidato,estado,solicitacao_id)
        values ($1,$2,$3,$4::jsonb,$5,$6) returning ${CAMPOS_CASO}`,
      [medicoId, mensagemId, identidade, JSON.stringify(candidato), estado, solicitacao?.id ?? null]);
      return rows[0]!;
    });
  }

  async obter(id: string): Promise<CasoFiscal | null> {
    const { rows } = await this.pool.query<CasoFiscal>(
      `select ${CAMPOS_CASO} from agente_fiscal_casos where id=$1`, [id]);
    return rows[0] ?? null;
  }

  async obterPorPagamento(medicoId: string, mensagemPagamentoId: string): Promise<CasoFiscal | null> {
    const { rows } = await this.pool.query<CasoFiscal>(`
      select ${CAMPOS_CASO} from agente_fiscal_casos
      where medico_id=$1 and mensagem_pagamento_id=$2`, [medicoId, mensagemPagamentoId]);
    return rows[0] ?? null;
  }

  async listarEmAndamento(limite = 50): Promise<CasoFiscal[]> {
    const { rows } = await this.pool.query<CasoFiscal>(`
      select ${CAMPOS_CASO} from agente_fiscal_casos where estado='enfileirado'
      order by atualizado_em limit $1`, [Math.max(1, Math.min(500, limite))]);
    return rows;
  }

  async obterAtivo(medicoId: string): Promise<CasoFiscal | null> {
    const { rows } = await this.pool.query<CasoFiscal>(`
      select ${CAMPOS_CASO} from agente_fiscal_casos where medico_id=$1
      and coalesce(dados->>'revisaoManual','false') <> 'true'
      and (estado in ('em_revisao','aguardando_dados','aguardando_aprovacao')
        or (estado='adiado' and adiado_ate <= now()))
      order by (pergunta_pendente is not null) desc, criado_em limit 1`, [medicoId]);
    return rows[0] ?? null;
  }

  async listar(medicoId: string, limite = 20): Promise<CasoFiscal[]> {
    const { rows } = await this.pool.query<CasoFiscal>(`
      select ${CAMPOS_CASO} from agente_fiscal_casos where medico_id=$1
      order by criado_em desc limit $2`, [medicoId, Math.max(1, Math.min(100, limite))]);
    return rows;
  }

  /** Retorna null se outro consumidor já modificou a revisão. JSONs são substituídos integralmente. */
  async atualizar(id: string, revisao: number, patch: AtualizacaoCasoFiscal): Promise<CasoFiscal | null> {
    return this.atualizarNoDb(this.pool, id, revisao, patch);
  }

  async transicionarComSaida(id: string, revisao: number, patch: AtualizacaoCasoFiscal,
    saida: Pick<NovoEventoAgente, 'instanciaNome' | 'mensagemId' | 'payload'>): Promise<CasoFiscal | null> {
    return this.transacao(async (db) => {
      const caso = await this.atualizarNoDb(db, id, revisao, patch);
      if (!caso) return null;
      await this.enfileirarNoDb(db, { ...saida, medicoId: caso.medicoId, tipo: 'saida' });
      if (['enfileirado','recusado','adiado'].includes(caso.estado) || caso.dados.revisaoManual) {
        await this.enfileirarNoDb(db, { medicoId: caso.medicoId, instanciaNome: saida.instanciaNome,
          mensagemId: `avancar:${saida.mensagemId}`, tipo: 'entrada',
          payload: { tarefa: 'avancar', telefone: saida.payload.telefone } });
      }
      return caso;
    });
  }

  private async atualizarNoDb(db: Pick<pg.Pool, 'query'>, id: string, revisao: number,
    patch: AtualizacaoCasoFiscal): Promise<CasoFiscal | null> {
    const colunas = { candidato: 'candidato', estado: 'estado', solicitacaoId: 'solicitacao_id',
      perguntaPendente: 'pergunta_pendente', dados: 'dados', adiadoAte: 'adiado_ate' } as const;
    const valores: unknown[] = [id, revisao];
    const atribuicoes: string[] = [];
    for (const chave of Object.keys(colunas) as Array<keyof AtualizacaoCasoFiscal>) {
      if (patch[chave] === undefined) continue;
      const json = ['candidato', 'perguntaPendente', 'dados'].includes(chave);
      valores.push(json && patch[chave] !== null ? JSON.stringify(patch[chave]) : patch[chave]);
      atribuicoes.push(`${colunas[chave]}=$${valores.length}${json ? '::jsonb' : ''}`);
    }
    atribuicoes.push('revisao=revisao+1', 'atualizado_em=now()');
    const { rows } = await db.query<CasoFiscal>(`
      update agente_fiscal_casos set ${atribuicoes.join(',')}
      where id=$1 and revisao=$2 returning ${CAMPOS_CASO}`, valores);
    return rows[0] ?? null;
  }

  async enfileirarEvento(evento: NovoEventoAgente): Promise<boolean> {
    return this.transacao((db) => this.enfileirarNoDb(db, evento));
  }

  private async enfileirarNoDb(db: pg.PoolClient, evento: NovoEventoAgente): Promise<boolean> {
    if (!evento.mensagemId.trim()) throw new Error('Evento sem identidade de mensagem');
    await db.query(`insert into agente_fiscal_fluxos (medico_id) values ($1)
      on conflict do nothing`, [evento.medicoId]);
    const resultado = await db.query(`insert into agente_fiscal_eventos
      (medico_id,instancia_nome,mensagem_id,tipo,payload) values ($1,$2,$3,$4,$5::jsonb)
      on conflict (tipo,instancia_nome,mensagem_id) do nothing`,
    [evento.medicoId, evento.instanciaNome, evento.mensagemId, evento.tipo ?? 'entrada', JSON.stringify(evento.payload)]);
    return resultado.rowCount === 1;
  }

  /** Lease exclusivo por médico; renovar durante operações externas demoradas. */
  async reivindicarEvento(tipo: 'entrada' | 'saida', leaseMs = 120_000): Promise<EventoAgente | null> {
    return this.transacao(async (db) => {
      const { rows: fluxos } = await db.query<{ medico_id: string }>(`
        select f.medico_id from agente_fiscal_fluxos f
        where (f.lease_ate is null or f.lease_ate <= now()) and exists (
          select 1 from agente_fiscal_eventos e where e.medico_id=f.medico_id and e.tipo=$1
          and e.estado in ('pendente','processando') and e.disponivel_em <= now()
          and (e.lease_ate is null or e.lease_ate <= now()))
        order by f.medico_id for update of f skip locked limit 1`, [tipo]);
      if (!fluxos[0]) return null;
      const { rows } = await db.query<EventoAgente>(`
        update agente_fiscal_eventos set estado='processando', tentativas=tentativas+1,
          token_lease=gen_random_uuid(), lease_ate=now()+$3::int * interval '1 millisecond'
        where id=(select id from agente_fiscal_eventos where medico_id=$1 and tipo=$2
          and estado in ('pendente','processando') and disponivel_em <= now()
          and (lease_ate is null or lease_ate <= now()) order by criado_em,id limit 1)
        returning ${CAMPOS_EVENTO}`, [fluxos[0].medico_id, tipo, leaseMs]);
      const evento = rows[0];
      if (!evento) return null;
      await db.query(`update agente_fiscal_fluxos set token_lease=$2,
        lease_ate=now()+$3::int * interval '1 millisecond' where medico_id=$1`,
      [evento.medicoId, evento.tokenLease, leaseMs]);
      return evento;
    });
  }

  async renovarEvento(evento: EventoAgente, leaseMs = 120_000): Promise<boolean> {
    return this.transacao(async (db) => {
      const fluxo = await db.query(`update agente_fiscal_fluxos
        set lease_ate=now()+$3::int * interval '1 millisecond'
        where medico_id=$1 and token_lease=$2 and lease_ate > now()`,
      [evento.medicoId, evento.tokenLease, leaseMs]);
      if (!fluxo.rowCount) return false;
      await db.query(`update agente_fiscal_eventos set lease_ate=now()+$3::int * interval '1 millisecond'
        where id=$1 and token_lease=$2 and estado in ('processando','incerto')`, [evento.id, evento.tokenLease, leaseMs]);
      return true;
    });
  }

  /** Persistir ANTES de chamar WhatsApp. Um crash exige reconciliação, nunca reenvio automático. */
  async marcarEnvioIncerto(evento: EventoAgente): Promise<boolean> {
    const resultado = await this.pool.query(`update agente_fiscal_eventos e set estado='incerto'
      where e.id=$1 and e.token_lease=$2 and e.tipo='saida' and e.estado='processando'
      and e.lease_ate > now()`, [evento.id, evento.tokenLease]);
    return resultado.rowCount === 1;
  }

  async concluirEvento(evento: EventoAgente): Promise<boolean> {
    return this.finalizarEvento(evento, null, 0);
  }

  async falharEvento(evento: EventoAgente, erro: string, atrasoMs = 30_000): Promise<boolean> {
    return this.finalizarEvento(evento, erro, atrasoMs);
  }

  private async finalizarEvento(evento: EventoAgente, erro: string | null, atrasoMs: number): Promise<boolean> {
    return this.transacao(async (db) => {
      // Mesma ordem de locks da reivindicação; tokens antigos nunca liberam o lease de outro worker.
      const fluxo = await db.query(`update agente_fiscal_fluxos set token_lease=null,lease_ate=null
        where medico_id=$1 and token_lease=$2 and lease_ate > now()`, [evento.medicoId, evento.tokenLease]);
      if (!fluxo.rowCount) return false;
      const resultado = await db.query(`update agente_fiscal_eventos
        set estado=$3, token_lease=null, lease_ate=null, ultimo_erro=$4,
          concluido_em=case when $3='concluido' then now() else null end,
          disponivel_em=now()+$5::int * interval '1 millisecond'
        where id=$1 and token_lease=$2 and estado in ('processando','incerto')`,
      [evento.id, evento.tokenLease, erro === null ? 'concluido' : evento.tentativas >= 5 ? 'falha' : 'pendente', erro?.slice(0, 2000), atrasoMs]);
      return resultado.rowCount === 1;
    });
  }

  private async transacao<T>(executar: (db: pg.PoolClient) => Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query('begin');
      const resultado = await executar(db);
      await db.query('commit');
      return resultado;
    } catch (erro) {
      await db.query('rollback');
      throw erro;
    } finally {
      db.release();
    }
  }
}
