/**
 * Caso de uso: Processamento do comando rápido /agendado disparado pelo médico.
 * Garante o cadastro mínimo do paciente sem atrito (seção 2.2) e registra
 * a consulta na agenda com data/hora e valores extraídos opportunisticamente (seção 3.1).
 */

import { extrairDadosAgendamentoComIa } from '../agendamento/extrair-dados-agendamento-ia.js';
import { gerarHashCpf } from '../paciente/hash-cpf.js';
import type { AtendimentoRepositorio, ConversaRegistro } from '../atendimento/atendimento-repositorio.js';
import type { ExtratorIaService } from '../ia/extrator-ia-service.js';

export interface ProcessarAgendadoDeps {
  repositorio: AtendimentoRepositorio;
  pepper: string;
  iaService?: ExtratorIaService;
  agora?: () => Date;
}

export interface ResultadoProcessarAgendado {
  ok: true;
  agendamentoId: string;
  pacienteId: string;
  dataHora: Date;
}

export async function processarComandoAgendado(
  conversa: ConversaRegistro,
  mensagensRecentes: string[],
  deps: ProcessarAgendadoDeps
): Promise<ResultadoProcessarAgendado> {
  const dataAtual = deps.agora ? deps.agora() : new Date();
  const dados = await extrairDadosAgendamentoComIa(mensagensRecentes, {
    iaService: deps.iaService,
    agora: dataAtual
  });

  let pacienteId = conversa.pacienteId;
  if (!pacienteId) {
    const existente = await deps.repositorio.buscarPacientePorTelefone(
      conversa.medicoId,
      conversa.contatoTelefone
    );
    if (existente) {
      pacienteId = existente.id;
    } else {
      const cpfHash = dados.cpfPaciente ? gerarHashCpf(dados.cpfPaciente, deps.pepper) : null;
      const novo = await deps.repositorio.criarPacienteMinimo({
        medicoId: conversa.medicoId,
        telefone: conversa.contatoTelefone,
        nome: dados.nomePaciente,
        email: dados.emailPaciente,
        cpfHash,
        origemCadastro: 'conversa'
      });
      pacienteId = novo.id;
    }
    await deps.repositorio.vincularPacienteConversa(conversa.id, pacienteId);
  }

  const agendamento = await deps.repositorio.criarAgendamento({
    medicoId: conversa.medicoId,
    pacienteId,
    conversaId: conversa.id,
    dataHora: dados.dataHora,
    valorConsultaCentavos: dados.valorConsultaCentavos
  });

  return { ok: true, agendamentoId: agendamento.id, pacienteId, dataHora: dados.dataHora };
}
