/**
 * Caso de uso: Processamento da resposta do paciente ao pedido de CPF.
 * Valida o documento recebido, atualiza o cadastro do paciente, consulta
 * dados complementares (se provedor ativo) e libera notas pendentes na fila (seção 2.3).
 */

import { extrairCpfTexto } from '../paciente/extrair-cpf-texto.js';
import { gerarHashCpf } from '../paciente/hash-cpf.js';
import type { AtendimentoRepositorio, ConversaRegistro } from '../atendimento/atendimento-repositorio.js';
import type { ConsultaCpfProvider } from '../paciente/consulta-cpf-provider.js';

export interface ProcessarRespostaCpfDeps {
  repositorio: AtendimentoRepositorio;
  consultaCpfProvider?: ConsultaCpfProvider;
  pepper: string;
}

export type ResultadoProcessarRespostaCpf =
  | { ok: true; cpf: string; solicitacoesLiberadas: number }
  | { ok: false; motivo: 'cpf_invalido_ou_ausente' };

export async function processarRespostaCpf(
  conversa: ConversaRegistro,
  textoMensagem: string,
  deps: ProcessarRespostaCpfDeps
): Promise<ResultadoProcessarRespostaCpf> {
  const cpfValido = extrairCpfTexto(textoMensagem);
  if (!cpfValido || !conversa.pacienteId) {
    return { ok: false, motivo: 'cpf_invalido_ou_ausente' };
  }

  const cpfHash = gerarHashCpf(cpfValido, deps.pepper);
  const dadosConsulta = deps.consultaCpfProvider
    ? await deps.consultaCpfProvider.consultar(cpfValido)
    : null;

  await deps.repositorio.atualizarCpfPaciente({
    pacienteId: conversa.pacienteId,
    cpfHash,
    nome: dadosConsulta?.nome,
    dataNascimento: dadosConsulta?.dataNascimento
  });

  await deps.repositorio.marcarAguardandoCpf(conversa.id, null);
  const solicitacoesLiberadas = await deps.repositorio.liberarSolicitacoesPendentesCpf(
    conversa.medicoId,
    conversa.pacienteId
  );

  return { ok: true, cpf: cpfValido, solicitacoesLiberadas };
}
