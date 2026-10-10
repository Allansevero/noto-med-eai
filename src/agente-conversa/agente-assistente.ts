import { inconsistenciasResposta } from './coerencia-resposta.js';
import { contextualizarResposta } from './contexto-resposta.js';
import { marcarMensagemLida, type LeitorMensagemWhatsApp } from '../whatsapp/marcar-mensagem-lida.js';
import { z } from 'zod';
import { ErroNvidiaChat } from '../io/nvidia/chat-client.js';
import { diagnosticoErroWebhook } from '../whatsapp/diagnostico-webhook.js';
import {
  decisaoAssistenteSchema,
  validarAcoes,
  type DecisorAssistente
} from './decisao-assistente.js';
import type {
  PostgresAssistente,
  EntradaTurno
} from './postgres-assistente.js';
import type { ContextoMensagemNoto, GeradorMensagemNoto } from '../conversa/comunicador-noto.js';
import type { EnviarMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';
function codigoFalha(erro: unknown): string {
  if (erro instanceof ErroNvidiaChat) {
    const permitidos = ['IA_NAO_CONFIGURADA','IA_CONEXAO_FALHOU','IA_HTTP_ERRO','IA_RESPOSTA_INVALIDA'];
    const codigo = permitidos.includes(erro.codigo) ? erro.codigo : 'IA_FALHOU';
    return codigo + (Number.isInteger(erro.statusHttp) && erro.statusHttp! >= 100 && erro.statusHttp! <= 599 ? '_' + erro.statusHttp : '');
  }
  if (erro instanceof z.ZodError) return 'DADOS_INVALIDOS';
  if (erro instanceof SyntaxError) return 'JSON_INVALIDO';
  const banco = diagnosticoErroWebhook(erro);
  return banco.codigoBanco ? 'BANCO_' + banco.codigoBanco : 'PROCESSAMENTO_FALHOU';
}

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
    private instancia: string,
    private leitor?: LeitorMensagemWhatsApp,
    private modoCadastro: 'conversacional' | 'confirmacao' = 'conversacional'
  ) {}
  async receber(e: EntradaTurno) {
    if (this.modoCadastro === 'confirmacao') return {estado: 'suspenso', mensagensConfirmadas: 0};
    if (e.instancia !== this.instancia) throw Error('INSTANCIA_INVALIDA');
    const nova = await this.repo.enfileirar(e);
    const leitura = nova && this.leitor && e.chaveMensagem && e.contatoTelefone
      ? marcarMensagemLida(this.leitor, { instanciaNome: e.instancia, mensagemId: e.mensagemId, contatoTelefone: e.contatoTelefone, chaveMensagem: e.chaveMensagem })
        .then(resultado => console.info('[Assistente contextual]', { medicoId: e.medicoId, fase: 'marcar_lida', sucesso: resultado.sucesso, codigo: resultado.erro }))
      : Promise.resolve();
    await Promise.all([leitura, this.processar(e.medicoId)]);
    return this.repo.resultado(e);
  }
  async iniciarAoConectar(medicoId: string) {
    if (this.modoCadastro === 'confirmacao') return;
    await this.repo.enfileirarApresentacao(medicoId, this.instancia);
    await this.processar(medicoId);
  }
  async recuperar() {
    if (this.modoCadastro === 'confirmacao') return;
    for (const id of await this.repo.pendentes()) await this.processar(id);
  }
  async processar(medicoId: string) {
    if (this.modoCadastro === 'confirmacao') return;
    for (let i = 0; i < 10; i++) {
      const r = await this.repo.reservar(medicoId);
      if (!r) return;
      let falhou = false;
      let fase = 'carregar_contexto';
      try {
        const { telefone, ...panorama } = await this.repo.panorama(medicoId);
        if (typeof telefone !== 'string' || !telefone)
          throw Error('CONTATO_INVALIDO');
        const historico = await this.repo.historico(
          medicoId,
          r.turno.sequencia
        );
        r.estado = contextualizarResposta(r.estado, historico, r.turno.texto);
        if (r.turno.estado === 'analisando') {
          fase = 'decidir';
          const decisao =
            r.turno.texto === '' &&
            r.turno.mensagem_id.startsWith('apresentacao:')
              ? decisaoAssistenteSchema.parse({
                  intencao: 'responder',
                  ritmo: 'manter',
                  assunto: 'Apresentar Noto e pedir nome real',
                  acoes: []
                })
              : decisaoAssistenteSchema.parse(
                  await this.decisor.decidir({
                    estado: r.estado,
                    mensagemRecebida: r.turno.texto,
                    historico,
                    panorama
                  })
                );
          fase = 'validar_dados';
          const { patch, resultados } = validarAcoes(
            decisao,
            r.turno.texto,
            r.estado
          );
          // Validação não significa gravação. O repositório confirma ambos na mesma transação.
          fase = 'gravar_dados';
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
        if (r.turno.estado === 'aplicado' && await this.repo.temMensagemPosterior?.(r)) {
          await this.repo.descartarRespostaSuperada(r);
          continue;
        }
        if (r.turno.estado === 'aplicado') {
          fase = 'redigir';
          const contextoResposta: ContextoMensagemNoto = {
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
                apresentacaoInicial:
                  r.turno.texto === '' &&
                  r.turno.mensagem_id.startsWith('apresentacao:'),
                estado: r.estado,
                intencao: r.turno.decisao.intencao,
                assunto: r.turno.resultados.some((x: any) => ['rejeitado', 'rejeitada'].includes(x.estado))
                  ? 'Responder usando os campos realmente salvos; não confirmar dados rejeitados nem pedir de novo campos já salvos.' : r.turno.decisao.assunto,
                resultados: r.turno.resultados,
                panorama,
                ferramentasDisponiveis: [
                  'registrar_dados_profissionais',
                  'registrar_periodo',
                  'registrar_preferencia'
                ],
                proximoPasso: r.estado.etapa,
                orientacaoPacientes: 'Após nome, CRM e escolha opcional de RQE, explique que pacientes podem ser importados pelas integrações disponíveis (planilha Google ou TribemD). Use quantidadePacientes real. Pergunte o período para procurar comprovantes; em seguida, a preferência para data da consulta na descrição. Só confirme coleta efetivamente registrada; não afirme que a busca ou emissão já iniciou.',
                acoesFiscaisExecutadas: false
              }
            };
          let mensagens = mensagensSchema.parse(await this.gerador.gerar(contextoResposta));
          const inconsistencias = inconsistenciasResposta(mensagens, r.estado, r.turno.resultados);
          if (inconsistencias.length) {
            mensagens = mensagensSchema.parse(await this.gerador.gerar({ ...contextoResposta,
              dados: { ...contextoResposta.dados, correcaoResposta: { codigos: inconsistencias,
                orientacao: 'Reescreva a resposta com base no estado salvo. Não peça campos já informados nem confirme campo rejeitado.' } } }));
            if (inconsistenciasResposta(mensagens, r.estado, r.turno.resultados).length) throw Error('RESPOSTA_INCOERENTE');
          }
          fase = 'salvar_resposta';
          await this.repo.prepararResposta(r, mensagens);
        }
        if (r.turno.confirmadas === 0 && await this.repo.temMensagemPosterior?.(r)) {
          await this.repo.descartarRespostaSuperada(r);
          continue;
        }
        fase = 'iniciar_envio';
        await this.repo.iniciarEnvio(r);
        for (let j = 0; j < r.turno.mensagens.length; j++) {
          fase = 'enviar';
          const envio = await this.enviar.enviarTexto({
            instanciaNome: this.instancia,
            contatoTelefone: telefone,
            texto: r.turno.mensagens[j]
          });
          if (!envio.sucesso) throw Error('ENVIO_NAO_CONFIRMADO');
          fase = 'confirmar_envio';
          await this.repo.confirmarMensagem(r, j + 1);
        }
        fase = 'concluir';
        await this.repo.concluir(r);
      } catch (erro) {
        falhou = true;
        const codigo = codigoFalha(erro);
        await this.repo.falhar(r, fase + ':' + codigo).catch(() => {});
        console.warn('[Assistente contextual]', {
          medicoId,
          turnoId: r.turno.id,
          etapa: r.turno.estado,
          estado: 'falha_registrada',
          fase,
          codigo
        });
      } finally {
        await this.repo.liberar(r);
      }
      if (falhou) return;
    }
  }
}
