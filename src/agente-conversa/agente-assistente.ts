import { z } from 'zod';
import {
  decisaoAssistenteSchema,
  validarAcoes,
  type DecisorAssistente
} from './decisao-assistente.js';
import type {
  PostgresAssistente,
  EntradaTurno
} from './postgres-assistente.js';
import type { GeradorMensagemNoto } from '../conversa/comunicador-noto.js';
import type { EnviarMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';
const mensagensSchema = z
  .array(z.string().trim().min(1).max(500))
  .min(1)
  .max(3);
/** Um turno só registra ações validadas, depois redige a partir do resultado confirmado. */
export class AgenteAssistente {
  constructor(
    private repo: PostgresAssistente,
    private decisor: DecisorAssistente,
    private gerador: GeradorMensagemNoto,
    private enviar: EnviarMensagemPaciente,
    private instancia: string
  ) {}
  async receber(e: EntradaTurno) {
    if (e.instancia !== this.instancia) throw Error('INSTANCIA_INVALIDA');
    await this.repo.enfileirar(e);
    await this.processar(e.medicoId);
    return { estado: 'registrado' };
  }
  async recuperar() {
    for (const id of await this.repo.pendentes()) await this.processar(id);
  }
  async processar(medicoId: string) {
    for (let i = 0; i < 10; i++) {
      const r = await this.repo.reservar(medicoId);
      if (!r) return;
      let falhou = false;
      try {
        const { telefone, ...panorama } = await this.repo.panorama(medicoId);
        if (typeof telefone !== 'string' || !telefone)
          throw Error('CONTATO_INVALIDO');
        const historico = await this.repo.historico(
          medicoId,
          r.turno.sequencia
        );
        if (r.turno.estado === 'analisando') {
          const decisao = decisaoAssistenteSchema.parse(
            await this.decisor.decidir({
              estado: r.estado,
              mensagemRecebida: r.turno.texto,
              historico,
              panorama
            })
          );
          const { patch, resultados } = validarAcoes(
            decisao,
            r.turno.texto,
            r.estado
          );
          // Validação não significa gravação. O repositório confirma ambos na mesma transação.
          await this.repo.aplicar(
            r,
            patch,
            decisao,
            resultados.map((x) => ({
              ...x,
              estado: x.estado === 'validado' ? 'salvo' : x.estado
            }))
          );
        }
        if (r.turno.estado === 'aplicado') {
          const mensagens = mensagensSchema.parse(
            await this.gerador.gerar({
              evento: 'conversa',
              destinatario: 'medico',
              medico: {
                nome: r.estado.nomeConfirmado ?? null,
                crm: r.estado.crmInformado ?? null,
                rqe: r.estado.rqeInformado ?? null
              },
              caso: null,
              quantidadeNotasParadas: 0,
              mensagemRecebida: r.turno.texto,
              historico,
              dados: {
                fluxo: 'assistente_contextual',
                estado: r.estado,
                intencao: r.turno.decisao.intencao,
                assunto: r.turno.decisao.assunto,
                resultados: r.turno.resultados,
                panorama,
                ferramentasDisponiveis: [
                  'registrar_dados_profissionais',
                  'registrar_periodo',
                  'registrar_preferencia'
                ],
                acoesFiscaisExecutadas: false
              }
            })
          );
          await this.repo.prepararResposta(r, mensagens);
        }
        await this.repo.iniciarEnvio(r);
        for (let j = 0; j < r.turno.mensagens.length; j++) {
          const envio = await this.enviar.enviarTexto({
            instanciaNome: this.instancia,
            contatoTelefone: telefone,
            texto: r.turno.mensagens[j]
          });
          if (!envio.sucesso) throw Error('ENVIO_NAO_CONFIRMADO');
          await this.repo.confirmarMensagem(r, j + 1);
        }
        await this.repo.concluir(r);
      } catch {
        falhou = true;
        await this.repo.falhar(r).catch(() => {});
        console.warn('[Assistente contextual]', {
          medicoId,
          turnoId: r.turno.id,
          etapa: r.turno.estado,
          estado: 'falha_registrada'
        });
      } finally {
        await this.repo.liberar(r);
      }
      if (falhou) return;
    }
  }
}
