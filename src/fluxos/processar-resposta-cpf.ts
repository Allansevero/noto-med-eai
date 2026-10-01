/**
 * Caso de uso: Processamento da resposta do paciente ao pedido de CPF.
 * Valida o documento recebido, atualiza o cadastro do paciente, consulta
 * dados complementares (se provedor ativo) e libera notas pendentes na fila (seção 2.3).
 */

import { extrairCpfTexto } from '../paciente/extrair-cpf-texto.js';
import { gerarHashCpf } from '../paciente/hash-cpf.js';
import { ehNomeCivilValido } from '../paciente/regras/validar-nome-civil.js';
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
  if (!cpfValido || !conversa.pacienteId || !conversa.medicoId) {
    return { ok: false, motivo: 'cpf_invalido_ou_ausente' };
  }

  const cpfHash = gerarHashCpf(cpfValido, deps.pepper);
  const pacienteAtual = await deps.repositorio.buscarPacientePorId(conversa.pacienteId);

  let nomeFinal: string | null = pacienteAtual?.nome ?? null;
  let dataNascFinal: Date | null = pacienteAtual?.dataNascimento ?? null;
  let nomeValidado = Boolean(pacienteAtual?.nomeValidado);

  // 1. Se já está validado com TAG 'válido' de uma emissão prévia, mantém e não faz requisição
  if (nomeValidado && ehNomeCivilValido(nomeFinal)) {
    // Mantém nome e validação existentes
  } else {
    // 2. Se outro cadastro deste mesmo médico já possui esse CPF com TAG 'válido', reaproveita
    if (deps.repositorio.buscarPacientePorCpfHash) {
      const existente = await deps.repositorio.buscarPacientePorCpfHash(conversa.medicoId, cpfHash);
      if (existente?.nomeValidado && ehNomeCivilValido(existente.nome)) {
        nomeFinal = existente.nome;
        dataNascFinal = existente.dataNascimento ?? dataNascFinal;
        nomeValidado = true;
      }
    }

    // 3. Se ainda não possui nome validado, faz a 1ª verificação na API da Receita Federal
    if (!nomeValidado && deps.consultaCpfProvider) {
      try {
        const dadosConsulta = await deps.consultaCpfProvider.consultar(cpfValido);
        if (dadosConsulta?.nome && ehNomeCivilValido(dadosConsulta.nome)) {
          nomeFinal = dadosConsulta.nome;
          dataNascFinal = dadosConsulta.dataNascimento ?? dataNascFinal;
          console.log(`[processarRespostaCpf] 1ª verificação: nome civil obtido da Receita Federal: ${nomeFinal}`);
        }
      } catch (err: any) {
        console.warn('[processarRespostaCpf] Falha na 1ª consulta de CPF:', err?.message || err);
      }
    }
  }

  await deps.repositorio.atualizarCpfPaciente({
    pacienteId: conversa.pacienteId,
    cpfHash,
    cpf: cpfValido,
    nome: nomeFinal,
    dataNascimento: dataNascFinal,
    nomeValidado
  });


  await deps.repositorio.marcarAguardandoCpf(conversa.id, null);
  const solicitacoesLiberadas = await deps.repositorio.liberarSolicitacoesPendentesCpf(
    conversa.medicoId,
    conversa.pacienteId
  );

  return { ok: true, cpf: cpfValido, solicitacoesLiberadas };
}
