/**
 * Caso de uso: Varredura de histórico anterior à conexão do sistema (onboarding).
 * Analisa conversas prévias da Evolution API para detectar CPFs enviados no passado,
 * consultando dados complementares e registrando o paciente automaticamente (seção 2.1).
 */

import { extrairCpfTexto } from '../paciente/extrair-cpf-texto.js';
import { gerarHashCpf } from '../paciente/hash-cpf.js';
import type { AtendimentoRepositorio, ConversaRegistro } from '../atendimento/atendimento-repositorio.js';
import type { ConsultaCpfProvider } from '../paciente/consulta-cpf-provider.js';

export interface SincronizarHistoricoDeps {
  repositorio: AtendimentoRepositorio;
  consultaCpfProvider?: ConsultaCpfProvider;
  pepper: string;
}

export interface ResultadoSincronizarHistorico {
  ok: true;
  pacienteVinculado: boolean;
  cpf?: string;
  pacienteId?: string;
}

export async function sincronizarHistoricoConversa(
  conversa: ConversaRegistro,
  mensagensHistorico: string[],
  deps: SincronizarHistoricoDeps
): Promise<ResultadoSincronizarHistorico> {
  const textoCompleto = mensagensHistorico.join('\n');
  const cpfValido = extrairCpfTexto(textoCompleto);

  if (!cpfValido) {
    return { ok: true, pacienteVinculado: false };
  }

  const cpfHash = gerarHashCpf(cpfValido, deps.pepper);
  const dadosConsulta = deps.consultaCpfProvider
    ? await deps.consultaCpfProvider.consultar(cpfValido)
    : null;

  let paciente = await deps.repositorio.buscarPacientePorTelefone(
    conversa.medicoId,
    conversa.contatoTelefone
  );

  if (paciente) {
    await deps.repositorio.atualizarCpfPaciente({
      pacienteId: paciente.id,
      cpfHash,
      nome: dadosConsulta?.nome,
      dataNascimento: dadosConsulta?.dataNascimento
    });
  } else {
    paciente = await deps.repositorio.criarPacienteMinimo({
      medicoId: conversa.medicoId,
      telefone: conversa.contatoTelefone,
      nome: dadosConsulta?.nome ?? null,
      cpfHash,
      origemCadastro: 'historico_whatsapp'
    });
  }

  await deps.repositorio.vincularPacienteConversa(conversa.id, paciente.id);
  return { ok: true, pacienteVinculado: true, cpf: cpfValido, pacienteId: paciente.id };
}
