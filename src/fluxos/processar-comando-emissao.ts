/**
 * Caso de uso: Processamento do comando rápido /emissao disparado pelo médico.
 * Consolida consultas em aberto, calcula o valor dos serviços, monta xdesc_serv legal
 * e gerencia a fila ('pronta' vs 'pendente_cadastro' com reenvio de CPF, seção 3.2).
 */

import { calcularValorEmissao } from '../emissao/calcular-valor-emissao.js';
import { montarDescricaoServico } from '../emissao/montar-descricao-servico.js';
import { MENSAGEM_PEDIDO_CPF } from '../whatsapp/whatsapp-config.js';
import type { AtendimentoRepositorio, ConversaRegistro } from '../atendimento/atendimento-repositorio.js';
import type { EnviarMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';

export interface ProcessarEmissaoDeps {
  repositorio: AtendimentoRepositorio;
  enviarMensagemPaciente: EnviarMensagemPaciente;
  instanciaNome: string;
  agora?: () => Date;
}

export type ResultadoProcessarEmissao =
  | { ok: true; solicitacaoId: string; fila: 'pronta' | 'pendente_cadastro'; aguardandoCpf: boolean }
  | { ok: false; motivo: 'paciente_ausente' | 'valor_indisponivel' | 'medico_nao_encontrado' };

export async function processarComandoEmissao(
  conversa: ConversaRegistro,
  valorDigitadoCentavos: number | null,
  deps: ProcessarEmissaoDeps
): Promise<ResultadoProcessarEmissao> {
  if (!conversa.pacienteId) return { ok: false, motivo: 'paciente_ausente' };

  const paciente = await deps.repositorio.buscarPacientePorId(conversa.pacienteId);
  const consultas = await deps.repositorio.buscarConsultasEmAberto(conversa.medicoId, conversa.pacienteId);
  const calculo = calcularValorEmissao(valorDigitadoCentavos, consultas.map((c) => c.valorConsultaCentavos));
  if (!calculo.ok || !calculo.valorCentavos) return { ok: false, motivo: 'valor_indisponivel' };

  const medico = await deps.repositorio.buscarDadosMedico(conversa.medicoId);
  if (!medico) return { ok: false, motivo: 'medico_nao_encontrado' };

  const xdescServ = montarDescricaoServico(medico, consultas.map((c) => c.dataHora));
  const possuiCpf = Boolean(paciente?.cpfHash);
  const fila = possuiCpf ? 'pronta' : 'pendente_cadastro';

  const solicitacao = await deps.repositorio.criarSolicitacaoNota({
    medicoId: conversa.medicoId,
    pacienteId: conversa.pacienteId,
    xdescServ,
    valorServicoCentavos: calculo.valorCentavos,
    ctribNac: medico.ctribNacPadrao,
    fila,
    agendamentoIds: consultas.map((c) => c.id)
  });

  if (!possuiCpf) {
    const dataAtual = deps.agora ? deps.agora() : new Date();
    await deps.repositorio.marcarAguardandoCpf(conversa.id, dataAtual);
    await deps.enviarMensagemPaciente.enviarTexto({
      instanciaNome: deps.instanciaNome,
      contatoTelefone: conversa.contatoTelefone,
      texto: MENSAGEM_PEDIDO_CPF
    });
  }

  return { ok: true, solicitacaoId: solicitacao.id, fila, aguardandoCpf: !possuiCpf };
}
