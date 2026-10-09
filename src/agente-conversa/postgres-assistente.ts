import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import {
  proximaEtapa,
  type EstadoContextual,
  type DecisaoAssistente
} from './decisao-assistente.js';
export interface EntradaTurno {
  medicoId: string;
  instancia: string;
  mensagemId: string;
  texto: string;
}
export interface Turno {
  id: string;
  sequencia: string;
  mensagem_id: string;
  texto: string;
  estado: string;
  decisao: DecisaoAssistente;
  resultados: unknown[];
  mensagens: string[];
  confirmadas: number;
}
export interface Reserva {
  medicoId: string;
  token: string;
  versao: number;
  estado: EstadoContextual;
  turno: Turno;
}
export class PostgresAssistente {
  constructor(private pool: pg.Pool) {}
  private async transacao<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect();
    try {
      await c.query('begin');
      const result = await fn(c);
      await c.query('commit');
      return result;
    } catch (e) {
      await c.query('rollback');
      throw e;
    } finally {
      c.release();
    }
  }
  async enfileirar(e: EntradaTurno) {
    if (
      !e.texto.trim() ||
      e.texto.length > 2000 ||
      !e.mensagemId ||
      e.mensagemId.length > 200
    )
      throw Error('ENTRADA_INVALIDA');
    await this.pool.query(
      `insert into noto_assistente_turnos(medico_id,instancia,mensagem_id,texto) values($1,$2,$3,$4) on conflict(instancia,mensagem_id) do nothing`,
      [e.medicoId, e.instancia, e.mensagemId, e.texto]
    );
  }
  async reservar(medicoId: string): Promise<Reserva | null> {
    return this.transacao(async (c) => {
      const ativo = await c.query(
        'select m.id from medicos m join usuarios u on u.id=m.usuario_id where m.id=$1 and u.ativo=true',
        [medicoId]
      );
      if (!ativo.rowCount) return null;
      await c.query(
        `insert into noto_assistente_sessoes(medico_id,estado) values($1,coalesce((select dados_novos from auditoria where entidade='medicos' and entidade_id=$1 and acao='estado_onboarding_assistente' order by criado_em desc limit 1),'{"etapa":"apresentacao"}'::jsonb)) on conflict do nothing`,
        [medicoId]
      );
      const s = (
        await c.query(
          `select *, reservado_em>now()-interval '5 minutes' as ocupada from noto_assistente_sessoes where medico_id=$1 for update`,
          [medicoId]
        )
      ).rows[0];
      if (s.reserva && s.ocupada) return null;
      if (!s.estado.preferencia) {
        const pref = (
          await c.query(
            "select dados_novos->>'preferencia' as preferencia from auditoria where entidade='medicos' and entidade_id=$1 and acao='preferencia_data_consulta' order by criado_em desc limit 1",
            [medicoId]
          )
        ).rows[0]?.preferencia;
        if (['mesma_do_comprovante', 'perguntar_uma_a_uma'].includes(pref))
          s.estado.preferencia = pref;
      }
      await c.query(
        `update noto_assistente_turnos set estado=case when estado='enviando' then 'incerto' when estado='analisando' then 'pendente' else estado end,diagnostico=case when estado='enviando' then 'ENTREGA_INCERTA' else diagnostico end where medico_id=$1 and estado in ('analisando','enviando')`,
        [medicoId]
      );
      const t = (
        await c.query(
          `select *,proxima_tentativa_em<=now() as pronta from noto_assistente_turnos where medico_id=$1 and estado in ('pendente','aplicado','preparado') order by sequencia limit 1 for update`,
          [medicoId]
        )
      ).rows[0];
      if (!t || !t.pronta) {
        await c.query(
          'update noto_assistente_sessoes set reserva=null,reservado_em=null where medico_id=$1',
          [medicoId]
        );
        return null;
      }
      const token = randomUUID();
      await c.query(
        'update noto_assistente_sessoes set reserva=$2,reservado_em=now() where medico_id=$1',
        [medicoId, token]
      );
      t.estado = t.estado === 'pendente' ? 'analisando' : t.estado;
      await c.query(
        'update noto_assistente_turnos set estado=$2,tentativas=tentativas+1 where id=$1',
        [t.id, t.estado]
      );
      return { medicoId, token, versao: s.versao, estado: s.estado, turno: t };
    });
  }
  private async cerca(c: pg.PoolClient, r: Reserva) {
    const s = (
      await c.query(
        `select * from noto_assistente_sessoes where medico_id=$1 and reserva=$2 and reservado_em>now()-interval '5 minutes' for update`,
        [r.medicoId, r.token]
      )
    ).rows[0];
    if (!s) throw Error('RESERVA_INVALIDA');
    return s;
  }
  async aplicar(
    r: Reserva,
    patch: Partial<EstadoContextual>,
    decisao: DecisaoAssistente,
    resultados: unknown[]
  ): Promise<EstadoContextual> {
    const estado = await this.transacao(async (c) => {
      const s = await this.cerca(c, r);
      if (s.versao !== r.versao) throw Error('RESERVA_VERSAO');
      const t = (
        await c.query(
          'select estado from noto_assistente_turnos where id=$1 and medico_id=$2 for update',
          [r.turno.id, r.medicoId]
        )
      ).rows[0];
      if (t?.estado !== 'analisando') throw Error('TURNO_INVALIDO');
      const m = (
        await c.query(
          'select m.usuario_id from medicos m join usuarios u on u.id=m.usuario_id where m.id=$1 and u.ativo=true for update of m',
          [r.medicoId]
        )
      ).rows[0];
      if (!m) throw Error('MEDICO_INATIVO');
      await c.query(
        `update medicos set nome_completo=coalesce($2,nome_completo),crm=coalesce($3,crm),rqe=case when $5 then $4 else rqe end,atualizado_em=now() where id=$1`,
        [
          r.medicoId,
          patch.nomeConfirmado ?? null,
          patch.crmInformado ?? null,
          patch.rqeInformado ?? null,
          patch.rqeInformado !== undefined
        ]
      );
      if (patch.nomeConfirmado)
        await c.query(
          'update usuarios set nome=$2,atualizado_em=now() where id=$1',
          [m.usuario_id, patch.nomeConfirmado]
        );
      const novo: EstadoContextual = { ...s.estado, ...patch };
      novo.etapa = proximaEtapa(novo);
      if (decisao.ritmo === 'pausar') novo.pausado = true;
      if (decisao.ritmo === 'retomar') novo.pausado = false;
      if (patch.preferencia)
        await c.query(
          `insert into auditoria(acao,entidade,entidade_id,dados_novos) values('preferencia_data_consulta','medicos',$1,$2::jsonb)`,
          [r.medicoId, JSON.stringify({ preferencia: patch.preferencia })]
        );
      await c.query(
        'update noto_assistente_sessoes set estado=$2,versao=versao+1,atualizado_em=now() where medico_id=$1',
        [r.medicoId, JSON.stringify(novo)]
      );
      await c.query(
        `update noto_assistente_turnos set estado='aplicado',decisao=$2,resultados=$3,atualizado_em=now() where id=$1`,
        [r.turno.id, JSON.stringify(decisao), JSON.stringify(resultados)]
      );
      return novo;
    });
    r.versao++;
    r.estado = estado;
    r.turno.estado = 'aplicado';
    r.turno.decisao = decisao;
    r.turno.resultados = resultados;
    return estado;
  }
  private async mudar(r: Reserva, sql: string, args: unknown[] = []) {
    return this.transacao(async (c) => {
      await this.cerca(c, r);
      const res = await c.query(sql, [r.turno.id, ...args]);
      if (!res.rowCount) throw Error('TURNO_INVALIDO');
    });
  }
  async prepararResposta(r: Reserva, m: string[]) {
    await this.mudar(
      r,
      `update noto_assistente_turnos set mensagens=$2,estado='preparado' where id=$1 and estado='aplicado'`,
      [JSON.stringify(m)]
    );
    r.turno.mensagens = m;
    r.turno.estado = 'preparado';
  }
  async iniciarEnvio(r: Reserva) {
    await this.mudar(
      r,
      `update noto_assistente_turnos set estado='enviando' where id=$1 and estado='preparado'`
    );
    r.turno.estado = 'enviando';
  }
  async confirmarMensagem(r: Reserva, n: number) {
    await this.mudar(
      r,
      `update noto_assistente_turnos set confirmadas=$2 where id=$1 and estado='enviando' and confirmadas=$2-1 and $2<=jsonb_array_length(mensagens)`,
      [n]
    );
    r.turno.confirmadas = n;
  }
  async concluir(r: Reserva) {
    await this.mudar(
      r,
      `update noto_assistente_turnos set estado='concluido' where id=$1 and estado='enviando' and confirmadas=jsonb_array_length(mensagens)`
    );
    r.turno.estado = 'concluido';
  }
  async liberar(r: Reserva) {
    await this.pool.query(
      'update noto_assistente_sessoes set reserva=null,reservado_em=null where medico_id=$1 and reserva=$2',
      [r.medicoId, r.token]
    );
  }
  async falhar(r: Reserva) {
    await this.mudar(
      r,
      `update noto_assistente_turnos set estado=case when estado='enviando' then 'incerto' when tentativas>=3 then 'falha' when estado='analisando' then 'pendente' else estado end,diagnostico=case when estado='enviando' then 'ENTREGA_INCERTA' else 'PROCESSAMENTO_FALHOU' end,proxima_tentativa_em=now()+interval '1 minute' where id=$1`
    );
  }
  async historico(medicoId: string, antes: string) {
    const rows = (
      await this.pool.query(
        'select texto,mensagens,confirmadas from noto_assistente_turnos where medico_id=$1 and sequencia<$2 order by sequencia desc limit 20',
        [medicoId, antes]
      )
    ).rows.reverse();
    const h: Array<{ papel: 'medico' | 'noto'; texto: string }> = [];
    for (const t of rows) {
      if (t.texto) h.push({ papel: 'medico', texto: t.texto });
      for (const texto of t.mensagens.slice(0, t.confirmadas))
        h.push({ papel: 'noto', texto });
    }
    return h.slice(-20);
  }
  async panorama(medicoId: string) {
    const m = (
      await this.pool.query(
        'select u.telefone from medicos m join usuarios u on u.id=m.usuario_id where m.id=$1 and u.ativo=true',
        [medicoId]
      )
    ).rows[0];
    if (!m) throw Error('MEDICO_INATIVO');
    const p = (
      await this.pool.query(
        'select count(*)::int as total from pacientes where medico_id=$1',
        [medicoId]
      )
    ).rows[0];
    const notas = (
      await this.pool.query(
        'select id,status from solicitacoes_nota where medico_id=$1 order by criado_em desc limit 5',
        [medicoId]
      )
    ).rows;
    return {
      telefone: m.telefone,
      quantidadePacientes: p.total,
      solicitacoes: notas
    };
  }
  async pendentes() {
    return (
      await this.pool.query(
        `select distinct medico_id from noto_assistente_turnos where estado in ('pendente','analisando','aplicado','preparado','enviando') and proxima_tentativa_em<=now() limit 20`
      )
    ).rows.map((x) => x.medico_id as string);
  }
  async registrarApresentacao(
    medicoId: string,
    estado: EstadoContextual,
    mensagens: string[],
    instancia: string,
    chave: string
  ) {
    await this.transacao(async (c) => {
      await c.query(
        'insert into noto_assistente_sessoes(medico_id,estado) values($1,$2) on conflict do nothing',
        [medicoId, JSON.stringify(estado)]
      );
      await c.query(
        `insert into noto_assistente_turnos(medico_id,instancia,mensagem_id,texto,estado,mensagens,confirmadas) values($1,$2,$3,'','concluido',$4,$5) on conflict do nothing`,
        [
          medicoId,
          instancia,
          'apresentacao:' + chave,
          JSON.stringify(mensagens),
          mensagens.length
        ]
      );
    });
  }
}
