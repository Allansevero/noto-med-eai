import { contextualizarResposta } from './contexto-resposta.js';
import type { ChaveMensagemLeitura } from '../whatsapp/marcar-mensagem-lida.js';
import type pg from 'pg';
import {
  nomeProfissionalValido,
  normalizarCrm
} from '../conta/validar-dados-emissao.js';
import { randomUUID } from 'node:crypto';
import {
  proximaEtapa,
  decisaoAssistenteSchema,
  validarAcoes,
  type EstadoContextual,
  type DecisaoAssistente
} from './decisao-assistente.js';
export interface EntradaTurno {
  medicoId: string;
  instancia: string;
  mensagemId: string;
  texto: string;
  contatoTelefone?: string;
  chaveMensagem?: ChaveMensagemLeitura;
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
    return this.transacao(async (c) => {
      await this.inicializarSessao(c, e.medicoId);
      const inserida = await c.query(
        `insert into noto_assistente_turnos(medico_id,instancia,mensagem_id,texto) values($1,$2,$3,$4) on conflict(instancia,mensagem_id) do nothing returning id`,
        [e.medicoId, e.instancia, e.mensagemId, e.texto]
      );
      return !!inserida.rowCount;
    });
  }
  private async inicializarSessao(c: pg.PoolClient, medicoId: string) {
    const anterior = (
      await c.query(
        `select dados_novos from auditoria where entidade='medicos' and entidade_id=$1 and acao='estado_onboarding_assistente' order by criado_em desc limit 1`,
        [medicoId]
      )
    ).rows[0]?.dados_novos;
    const estado: EstadoContextual = anterior ?? { etapa: 'apresentacao' };
    // Progresso legado não prova que o nome inicial era a identidade declarada.
    if (!nomeProfissionalValido(estado.nomeConfirmado)) {
      delete estado.nomeConfirmado;
      estado.identidadePendente = true;
    }
    return c.query(
      'insert into noto_assistente_sessoes(medico_id,estado) values($1,$2) on conflict do nothing returning medico_id',
      [medicoId, JSON.stringify(estado)]
    );
  }
  async enfileirarApresentacao(
    medicoId: string,
    instancia: string
  ): Promise<boolean> {
    return this.transacao(async (c) => {
      const conectado = await c.query(
        `select m.id from medicos m join usuarios u on u.id=m.usuario_id where m.id=$1 and u.ativo=true
      and exists(select 1 from whatsapp_instancias w where w.medico_id=m.id and w.oficial=false and w.status='conectado')`,
        [medicoId]
      );
      if (!conectado.rowCount) return false;
      const anterior = await c.query(
        `select id from auditoria a where entidade='medicos' and entidade_id=$1
      and acao in ('estado_onboarding_assistente','reserva_apresentacao_assistente') and (acao='estado_onboarding_assistente' or not
        coalesce((select r.dados_novos->>'estado'='falha_preparacao' and r.criado_em<now()-interval '1 minute' from auditoria r
          where r.entidade_id=$1 and r.acao='resultado_apresentacao_assistente' and r.dados_novos->>'reservaId'=a.id::text order by r.criado_em desc limit 1),false)) limit 1`,
        [medicoId]
      );
      if (anterior.rowCount) return false;
      // A criação da sessão é a trava comum ao primeiro webhook e à apresentação.
      if (!(await this.inicializarSessao(c, medicoId)).rowCount) return false;
      await c.query(
        `insert into noto_assistente_turnos(medico_id,instancia,mensagem_id,texto) values($1,$2,$3,'') on conflict do nothing`,
        [medicoId, instancia, 'apresentacao:' + medicoId]
      );
      return true;
    });
  }
  private async reconciliarPerfil(
    c: pg.PoolClient,
    medicoId: string,
    estado: EstadoContextual
  ) {
    const m = (
      await c.query('select nome_completo,crm,rqe from medicos where id=$1', [
        medicoId
      ])
    ).rows[0];
    const novo = { ...estado };
    const crm = normalizarCrm(m.crm);
    if (crm) novo.crmInformado = crm;
    else delete novo.crmInformado;
    if (
      m.rqe !== null ||
      novo.rqeInformado !== undefined ||
      novo.etapa === 'concluido'
    )
      novo.rqeInformado = m.rqe;
    if (novo.nomeConfirmado) {
      if (nomeProfissionalValido(m.nome_completo))
        novo.nomeConfirmado = m.nome_completo;
      else {
        delete novo.nomeConfirmado;
        novo.identidadePendente = true;
      }
    }
    return novo;
  }
  /** Reavalia somente propostas rejeitadas com a mensagem e a pergunta originais. Não reenvia turnos. */
  private async revalidarRecebidos(c: pg.PoolClient, medicoId: string, sessao: { estado: EstadoContextual; versao: number }) {
    if (sessao.estado.validacaoContextoVersao === 1) return;
    const rows = (await c.query(
      "select texto,decisao,resultados,mensagens,confirmadas from noto_assistente_turnos where medico_id=$1 and estado='concluido' order by sequencia desc limit 50", [medicoId]
    )).rows.reverse();
    let reconstruido: EstadoContextual = { etapa: 'apresentacao' };
    const historico: Array<{ papel: 'medico' | 'noto'; texto: string }> = [];
    const candidatos: Partial<EstadoContextual> = {};
    for (const row of rows) {
      reconstruido = contextualizarResposta(reconstruido, historico, row.texto);
      const decisao = decisaoAssistenteSchema.safeParse(row.decisao);
      if (decisao.success) {
        const { patch } = validarAcoes(decisao.data, row.texto, reconstruido);
        for (const campo of ['nomeConfirmado', 'crmInformado', 'rqeInformado'] as const) {
          const origem = campo === 'nomeConfirmado' ? 'nome' : campo === 'crmInformado' ? 'crm' : 'rqe';
          if (patch[campo] !== undefined && Array.isArray(row.resultados) && row.resultados.some((r: any) => r.campo === origem && r.estado === 'rejeitado'))
            Object.assign(candidatos, { [campo]: patch[campo] });
        }
        reconstruido = { ...reconstruido, ...patch };
        reconstruido.etapa = proximaEtapa(reconstruido);
      }
      if (row.texto) historico.push({ papel: 'medico', texto: row.texto });
      for (const texto of row.mensagens.slice(0, row.confirmadas)) historico.push({ papel: 'noto', texto });
    }
    const medico = (await c.query('select usuario_id,nome_completo,crm,rqe from medicos where id=$1 for update', [medicoId])).rows[0];
    const patch: Partial<EstadoContextual> = {};
    if (!sessao.estado.nomeConfirmado && candidatos.nomeConfirmado &&
        (!nomeProfissionalValido(medico.nome_completo) || medico.nome_completo === candidatos.nomeConfirmado)) patch.nomeConfirmado = candidatos.nomeConfirmado;
    if (!sessao.estado.crmInformado && candidatos.crmInformado &&
        (!normalizarCrm(medico.crm) || normalizarCrm(medico.crm) === candidatos.crmInformado)) patch.crmInformado = candidatos.crmInformado;
    if (sessao.estado.rqeInformado === undefined && candidatos.rqeInformado !== undefined && medico.rqe === null) patch.rqeInformado = candidatos.rqeInformado;
    const novo: EstadoContextual = { ...sessao.estado, ...patch, validacaoContextoVersao: 1 };
    if (!novo.interlocutor && reconstruido.interlocutor) novo.interlocutor = reconstruido.interlocutor;
    if (Object.keys(patch).length) {
      if (patch.nomeConfirmado || patch.crmInformado || patch.rqeInformado !== undefined) {
        await c.query('update medicos set nome_completo=coalesce($2,nome_completo),crm=coalesce($3,crm),rqe=case when $5 then $4 else rqe end,atualizado_em=now() where id=$1',
          [medicoId, patch.nomeConfirmado ?? null, patch.crmInformado ?? null, patch.rqeInformado ?? null, patch.rqeInformado !== undefined]);
        if (patch.nomeConfirmado) await c.query('update usuarios set nome=$2,atualizado_em=now() where id=$1', [medico.usuario_id, patch.nomeConfirmado]);
      }
      if (novo.etapa !== 'concluido') novo.etapa = proximaEtapa(novo);
      if (patch.nomeConfirmado) novo.identidadePendente = false;
      await c.query("insert into auditoria(acao,entidade,entidade_id,dados_novos) values('revalidacao_dados_assistente','medicos',$1,$2::jsonb)",
        [medicoId, JSON.stringify({ versao: 1, campos: Object.keys(patch) })]);
    }
    await c.query('update noto_assistente_sessoes set estado=$2,versao=versao+1,atualizado_em=now() where medico_id=$1', [medicoId, JSON.stringify(novo)]);
    sessao.estado = novo; sessao.versao++;
  }
  async resultado(e:EntradaTurno){
    const r=(await this.pool.query('select estado,confirmadas,diagnostico from noto_assistente_turnos where medico_id=$1 and instancia=$2 and mensagem_id=$3',[e.medicoId,e.instancia,e.mensagemId])).rows[0];
    return r?{estado:r.estado,mensagensConfirmadas:r.confirmadas,diagnostico:r.diagnostico}:{estado:'nao_registrado'};
  }
  async reservar(medicoId: string): Promise<Reserva | null> {
    return this.transacao(async (c) => {
      const ativo = await c.query(
        'select m.id from medicos m join usuarios u on u.id=m.usuario_id where m.id=$1 and u.ativo=true',
        [medicoId]
      );
      if (!ativo.rowCount) return null;
      await this.inicializarSessao(c, medicoId);
      const s = (
        await c.query(
          `select *, reservado_em>now()-interval '5 minutes' as ocupada from noto_assistente_sessoes where medico_id=$1 for update`,
          [medicoId]
        )
      ).rows[0];
      if (s.reserva && s.ocupada) return null;
      await this.revalidarRecebidos(c, medicoId, s);
      s.estado = await this.reconciliarPerfil(c, medicoId, s.estado);
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
        'update noto_assistente_sessoes set reserva=$2,reservado_em=now(),estado=$3 where medico_id=$1',
        [medicoId, token, JSON.stringify(s.estado)]
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
      if (
        patch.nomeConfirmado !== undefined ||
        patch.crmInformado !== undefined ||
        patch.rqeInformado !== undefined
      )
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
      const novo: EstadoContextual = { ...s.estado, ...patch, interlocutor: r.estado.interlocutor, perguntaPendente: r.estado.perguntaPendente };
      if (s.estado.etapa !== 'concluido' && Object.keys(patch).length)
        novo.etapa = proximaEtapa(novo);
      if (patch.nomeConfirmado) novo.identidadePendente = false;
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
  async temMensagemPosterior(r: Reserva): Promise<boolean> {
    return !!(await this.pool.query(
      'select id from noto_assistente_turnos where medico_id=$1 and sequencia>$2 and texto<>\'\' limit 1',
      [r.medicoId, r.turno.sequencia]
    )).rowCount;
  }
  async descartarRespostaSuperada(r: Reserva) {
    await this.mudar(r, `update noto_assistente_turnos set estado='concluido',mensagens='[]'::jsonb,confirmadas=0,diagnostico='RESPOSTA_SUPERADA',atualizado_em=now() where id=$1 and estado in ('aplicado','preparado') and confirmadas=0`);
    r.turno.estado = 'concluido'; r.turno.mensagens = [];
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
      `update noto_assistente_turnos set estado='concluido',diagnostico=null where id=$1 and estado='enviando' and confirmadas=jsonb_array_length(mensagens)`
    );
    r.turno.estado = 'concluido';
  }
  async liberar(r: Reserva) {
    await this.pool.query(
      'update noto_assistente_sessoes set reserva=null,reservado_em=null where medico_id=$1 and reserva=$2',
      [r.medicoId, r.token]
    );
  }
  async falhar(r: Reserva, diagnostico = 'PROCESSAMENTO_FALHOU') {
    await this.mudar(
      r,
      `update noto_assistente_turnos set estado=case when estado='enviando' then 'incerto' when tentativas>=3 then 'falha' when estado='analisando' then 'pendente' else estado end,diagnostico=case when estado='enviando' then 'ENTREGA_INCERTA' else $2 end,proxima_tentativa_em=now()+interval '1 minute',atualizado_em=now() where id=$1`,
      [diagnostico]
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
        'select u.telefone,m.nome_completo,m.crm,m.rqe from medicos m join usuarios u on u.id=m.usuario_id where m.id=$1 and u.ativo=true',
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
    const resultados = (
      await this.pool.query(
        'select resultados from noto_assistente_turnos where medico_id=$1 and resultados is not null order by sequencia desc limit 3',
        [medicoId]
      )
    ).rows.map((x) => x.resultados);
    const sessao = (
      await this.pool.query(
        'select estado from noto_assistente_sessoes where medico_id=$1',
        [medicoId]
      )
    ).rows[0]?.estado;
    return {
      cadastro: {
        nome:
          sessao?.nomeConfirmado && nomeProfissionalValido(m.nome_completo)
            ? m.nome_completo
            : null,
        crm: m.crm,
        rqe: m.rqe
      },
      resultadosAnteriores: resultados,
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
}
