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
  instanciaOficialNome?: string;
  agora?: () => Date;
}

export type ResultadoProcessarEmissao =
  | {
      ok: true;
      solicitacaoId: string;
      fila: 'pronta' | 'pendente_cadastro' | null;
      aguardandoCpf: boolean;
      aguardandoData: boolean;
    }
  | { ok: false; motivo: 'paciente_ausente' | 'valor_indisponivel' | 'medico_nao_encontrado' };

export async function processarComandoEmissao(
  conversa: ConversaRegistro,
  valorDigitadoCentavos: number | null,
  deps: ProcessarEmissaoDeps
): Promise<ResultadoProcessarEmissao> {
  let pacienteId = conversa.pacienteId;
  if (!pacienteId) {
    const existente = await deps.repositorio.buscarPacientePorTelefone(
      conversa.medicoId,
      conversa.contatoTelefone
    );
    if (existente) {
      pacienteId = existente.id;
    } else {
      const novo = await deps.repositorio.criarPacienteMinimo({
        medicoId: conversa.medicoId,
        telefone: conversa.contatoTelefone,
        origemCadastro: 'conversa'
      });
      pacienteId = novo.id;
    }
    await deps.repositorio.vincularPacienteConversa(conversa.id, pacienteId);
    conversa.pacienteId = pacienteId;
  }

  const paciente = await deps.repositorio.buscarPacientePorId(pacienteId);
  const consultas = await deps.repositorio.buscarConsultasEmAberto(conversa.medicoId, pacienteId);
  const calculo = calcularValorEmissao(valorDigitadoCentavos, consultas.map((c) => c.valorConsultaCentavos));
  if (!calculo.ok || !calculo.valorCentavos) return { ok: false, motivo: 'valor_indisponivel' };

  const medico = await deps.repositorio.buscarDadosMedico(conversa.medicoId);
  if (!medico) return { ok: false, motivo: 'medico_nao_encontrado' };

  const semDataConsulta = consultas.length === 0;
  const possuiCpf = Boolean(paciente?.cpfHash);
  const fila = semDataConsulta ? null : (possuiCpf ? 'pronta' : 'pendente_cadastro');
  const xdescServ = semDataConsulta
    ? montarDescricaoServico(medico, 'DATA A CONFIRMAR')
    : montarDescricaoServico(medico, consultas.map((c) => c.dataHora));

  const solicitacao = await deps.repositorio.criarSolicitacaoNota({
    medicoId: conversa.medicoId,
    pacienteId,
    xdescServ,
    valorServicoCentavos: calculo.valorCentavos,
    ctribNac: medico.ctribNacPadrao,
    fila,
    aguardandoDataConsulta: semDataConsulta,
    agendamentoIds: consultas.map((c) => c.id)
  });

  if (semDataConsulta) {
    const nomePaciente = paciente?.nome?.trim() ? `paciente ${paciente.nome.trim()}` : 'do paciente';
    const telMedico = medico.telefone || conversa.contatoTelefone;
    await deps.enviarMensagemPaciente.enviarTexto({
      instanciaNome: deps.instanciaOficialNome || 'notomed_oficial',
      contatoTelefone: telMedico,
      texto: `Não encontramos a data da consulta ${nomePaciente}, poderia me informar para emissão?`
    });
  }

  if (!possuiCpf) {
    const dataAtual = deps.agora ? deps.agora() : new Date();
    await deps.repositorio.marcarAguardandoCpf(conversa.id, dataAtual);
    await deps.enviarMensagemPaciente.enviarTexto({
      instanciaNome: deps.instanciaNome,
      contatoTelefone: conversa.contatoTelefone,
      texto: MENSAGEM_PEDIDO_CPF
    });
  }

  return {
    ok: true,
    solicitacaoId: solicitacao.id,
    fila,
    aguardandoCpf: !possuiCpf,
    aguardandoData: semDataConsulta
  };
}
