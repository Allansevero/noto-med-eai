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
  deps: SincronizarHistoricoDeps,
  nomeContato?: string | null
): Promise<ResultadoSincronizarHistorico> {
  if (!conversa.medicoId) {
    return { ok: true, pacienteVinculado: false };
  }
  const medicoId = conversa.medicoId;
  const textoCompleto = mensagensHistorico.join('\n');
  const cpfValido = extrairCpfTexto(textoCompleto);
  const cpfHash = cpfValido ? gerarHashCpf(cpfValido, deps.pepper) : null;
  const dadosConsulta = cpfValido && deps.consultaCpfProvider
    ? await deps.consultaCpfProvider.consultar(cpfValido)
    : null;

  let paciente = await deps.repositorio.buscarPacientePorTelefone(
    medicoId,
    conversa.contatoTelefone
  );

  if (paciente) {
    if (cpfValido && cpfHash) {
      await deps.repositorio.atualizarCpfPaciente({
        pacienteId: paciente.id,
        cpfHash,
        cpf: cpfValido,
        nome: dadosConsulta?.nome || nomeContato,
        dataNascimento: dadosConsulta?.dataNascimento
      });
    } else if (!paciente.nome && nomeContato) {
      paciente = await deps.repositorio.criarPacienteMinimo({
        medicoId,
        telefone: conversa.contatoTelefone,
        nome: nomeContato,
        origemCadastro: 'historico_whatsapp'
      });
    }
  } else {
    paciente = await deps.repositorio.criarPacienteMinimo({
      medicoId,
      telefone: conversa.contatoTelefone,
      nome: dadosConsulta?.nome || nomeContato || null,
      cpfHash,
      cpf: cpfValido,
      origemCadastro: 'historico_whatsapp'
    });
  }

  await deps.repositorio.vincularPacienteConversa(conversa.id, paciente.id);
  return {
    ok: true,
    pacienteVinculado: true,
    ...(cpfValido ? { cpf: cpfValido } : {}),
    pacienteId: paciente.id
  };
}
