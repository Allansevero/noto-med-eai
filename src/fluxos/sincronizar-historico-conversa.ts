/**
 * Caso de uso: Varredura de histórico anterior à conexão do sistema (onboarding).
 * Analisa conversas prévias da Evolution API para detectar CPFs enviados no passado,
 * consultando dados complementares e registrando o paciente automaticamente (seção 2.1).
 */

import { extrairCpfTexto } from '../paciente/extrair-cpf-texto.js';
import { gerarHashCpf } from '../paciente/hash-cpf.js';
import { ehNomeCivilValido } from '../paciente/regras/validar-nome-civil.js';
import type { AtendimentoRepositorio, ConversaRegistro } from '../atendimento/atendimento-repositorio.js';
import type { ConsultaCpfProvider, DadosConsultaCpf } from '../paciente/consulta-cpf-provider.js';

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

  let paciente = await deps.repositorio.buscarPacientePorTelefone(
    medicoId,
    conversa.contatoTelefone
  );

  let dadosConsulta: DadosConsultaCpf | null = null;
  const jaTemNomeValidado = paciente?.cpfHash === cpfHash && Boolean(paciente?.nomeValidado) && Boolean(paciente?.nome);

  if (cpfValido && deps.consultaCpfProvider && !jaTemNomeValidado) {
    dadosConsulta = await deps.consultaCpfProvider.consultar(cpfValido);
  }

  const nomeValido = dadosConsulta?.nome && ehNomeCivilValido(dadosConsulta.nome) ? dadosConsulta.nome : null;

  if (paciente) {
    if (cpfValido && cpfHash) {
      await deps.repositorio.atualizarCpfPaciente({
        pacienteId: paciente.id,
        cpfHash,
        cpf: cpfValido,
        nome: nomeValido || paciente.nome || null,
        dataNascimento: dadosConsulta?.dataNascimento || paciente.dataNascimento,
        nomeValidado: Boolean(nomeValido || paciente.nomeValidado)
      });
    }
  } else {
    paciente = await deps.repositorio.criarPacienteMinimo({
      medicoId,
      telefone: conversa.contatoTelefone,
      nome: nomeValido || null,
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
