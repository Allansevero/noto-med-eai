import type pg from 'pg';
import type { PostgresCasosRepositorio } from './repositorio.js';
import type { OrquestradorCasos } from './orquestrador.js';
import type { ServicoEmissaoCasos } from './servico-emissao.js';
import type { EnviarMensagemPaciente } from '../../whatsapp/enviar-mensagem-paciente.js';
import type { EventoAgente } from './modelo.js';

/** Fila persistida; um processamento por médico, respostas têm prioridade. */
export class WorkerCasos {
  private rodando = false;
  private timer?: NodeJS.Timeout;
  constructor(private pool: pg.Pool, private repo: PostgresCasosRepositorio,
    private orquestrador: OrquestradorCasos, private emissao: ServicoEmissaoCasos,
    private enviar: EnviarMensagemPaciente, private instanciaNome: string) {}

  iniciar() {
    this.timer = setInterval(() => { void this.ciclo().catch(() =>
      console.warn('[Agente casos]', { codigo: 'CICLO_FALHOU', orientacao: 'Verifique a migração de casos e a conexão com o banco.' })); }, 2000);
    this.timer.unref();
  }
  parar() { if (this.timer) clearInterval(this.timer); }

  async ciclo() {
    if (this.rodando) return;
    this.rodando = true;
    try {
      for (let i = 0; i < 10; i++) {
        const evento = await this.repo.reivindicarEvento('saida') || await this.repo.reivindicarEvento('entrada');
        if (!evento) break;
        const lock = await this.pool.connect();
        const chaveLock = `agente-casos:${evento.medicoId}`;
        let reservado: boolean;
        try {
          await lock.query('begin');
          reservado = Boolean((await lock.query('select pg_try_advisory_xact_lock(hashtextextended($1, 0)) as ok', [chaveLock])).rows[0]?.ok);
        } catch (erro) {
          lock.release(true);
          throw erro;
        }
        if (!reservado) {
          await lock.query('rollback');
          lock.release();
          await this.repo.falharEvento(evento, 'CONVERSA_OCUPADA', 5000);
          continue;
        }
        let leaseValido = true;
        const heartbeat = setInterval(() => { void this.repo.renovarEvento(evento)
          .then(ok => { leaseValido = leaseValido && ok; }).catch(() => { leaseValido = false; }); }, 20000);
        try {
          if (evento.tipo === 'saida') await this.entregar(evento);
          else {
            const existente = await this.pool.query(`select 1 from agente_fiscal_eventos
              where tipo='saida' and instancia_nome=$1 and mensagem_id=$2`,
            [evento.instanciaNome, `resposta:${evento.id}`]);
            if (!existente.rowCount) await this.orquestrador.processar(evento);
            if (!leaseValido) throw new Error('LEASE_PERDIDO');
            await this.repo.concluirEvento(evento);
          }
        } catch {
          if (evento.tipo === 'entrada') {
            await this.repo.falharEvento(evento, 'PROCESSAMENTO_FALHOU', Math.min(3600000, 30000 * 2 ** Math.min(evento.tentativas, 7)));
          }
          console.warn('[Agente casos]', { eventoId: evento.id, tipo: evento.tipo, codigo: 'PROCESSAMENTO_FALHOU' });
        } finally {
          clearInterval(heartbeat);
          let descartar = false;
          try { await lock.query('rollback'); } catch { descartar = true; }
          finally { lock.release(descartar); }
        }
      }
      await this.reconciliar();
    } finally { this.rodando = false; }
  }

  private async entregar(evento: EventoAgente) {
    const p = evento.payload as { texto: string; telefone: string; casoId?: string; pergunta?: boolean; revisaoPergunta?: number };
    if (!p.telefone || !p.texto) throw new Error('SAIDA_INVALIDA');
    if (p.pergunta && p.casoId) {
      const caso = await this.repo.obter(p.casoId);
      if (!caso || caso.revisao !== p.revisaoPergunta || !caso.perguntaPendente) {
        await this.repo.concluirEvento(evento); return; // resposta superada
      }
    }
    if (!await this.repo.marcarEnvioIncerto(evento)) return;
    const envio = await this.enviar.enviarTexto({ instanciaNome: evento.instanciaNome,
      contatoTelefone: p.telefone, texto: p.texto });
    if (!envio.sucesso || (p.pergunta && !envio.mensagemId)) {
      // Pode ter sido aceito remotamente. Não repetir uma pergunta automaticamente.
      console.warn('[Agente casos]', { eventoId: evento.id, codigo: 'ENTREGA_INCERTA' });
      return;
    }
    if (p.pergunta && p.casoId) {
      const caso = await this.repo.obter(p.casoId);
      if (caso && caso.revisao === p.revisaoPergunta && caso.perguntaPendente) {
        await this.repo.atualizar(caso.id, caso.revisao, {
          perguntaPendente: { ...caso.perguntaPendente, mensagemId: envio.mensagemId!, enviadaEm: new Date().toISOString() }
        });
      }
    }
    await this.repo.concluirEvento(evento);
  }

  private async reconciliar() {
    for (const caso of await this.repo.listarEmAndamento()) {
      if (!caso.solicitacaoId) continue;
      const resultado = await this.emissao.consultarStatus(caso.medicoId, caso.solicitacaoId);
      if (!resultado || resultado.status === 'enfileirado') {
        await this.repo.atualizar(caso.id, caso.revisao, {}); // rotaciona a próxima página de reconciliação
        continue;
      }
      const medico = await this.pool.query(`select u.telefone from medicos m join usuarios u on u.id=m.usuario_id
        where m.id=$1 and u.ativo=true`, [caso.medicoId]);
      if (!medico.rows[0]?.telefone) continue;
      await this.repo.transicionarComSaida(caso.id, caso.revisao, { estado: resultado.status }, {
        instanciaNome: this.instanciaNome, mensagemId: `resultado:${caso.id}:${resultado.status}`, payload: {
          telefone: medico.rows[0].telefone,
          texto: resultado.status === 'emitido' ? `A nota de ${caso.candidato.pacienteNome} foi autorizada.` :
            `A emissão da nota de ${caso.candidato.pacienteNome} encontrou um erro. Ela não foi confirmada como emitida.`
        }
      });
    }
  }
}
