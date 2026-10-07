/**
 * Caso de uso: Processamento da resposta do médico com a data da consulta.
 * Quando o médico responde à pergunta enviada pelo WhatsApp oficial,
 * atualiza a descrição legal da NFS-e com a data informada e avança a fila
 * para 'pronta' (se paciente já possui CPF) ou 'pendente_cadastro'.
 */

import { montarDescricaoServico } from '../emissao/montar-descricao-servico.js';
import type { AtendimentoRepositorio } from '../atendimento/atendimento-repositorio.js';
import type { EnviarMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';
import type { DadosProfissionaisService } from '../conta/dados-profissionais-service.js';

export interface ProcessarRespostaDataDeps {
  repositorio: AtendimentoRepositorio;
  enviarMensagem: EnviarMensagemPaciente;
  instanciaOficialNome?: string;
  dadosProfissionais?: DadosProfissionaisService;
}

export type ResultadoProcessarRespostaData =
  | { ok: true; solicitacaoId: string; dataInformada: string; fila: 'pronta' | 'pendente_cadastro' }
  | { ok: false; motivo: 'medico_nao_encontrado' | 'solicitacao_nao_encontrada' | 'data_vazia' };

export async function processarRespostaDataConsulta(
  telefoneMedico: string,
  textoResposta: string,
  deps: ProcessarRespostaDataDeps
): Promise<ResultadoProcessarRespostaData> {
  const dataInformada = textoResposta.trim();
  if (!dataInformada) {
    return { ok: false, motivo: 'data_vazia' };
  }

  const medico = await deps.repositorio.buscarMedicoPorTelefone(telefoneMedico);
  if (!medico) {
    return { ok: false, motivo: 'medico_nao_encontrado' };
  }

  const pendente = await deps.repositorio.buscarSolicitacaoAguardandoData(medico.id);
  if (!pendente) {
    return { ok: false, motivo: 'solicitacao_nao_encontrada' };
  }

  const novaDescricao = montarDescricaoServico({ ...medico, nomeCompleto: medico.nomeCompleto || '' }, dataInformada);
  const paciente = await deps.repositorio.buscarPacientePorId(pendente.pacienteId);
  const fila = paciente?.cpfHash ? 'pronta' : 'pendente_cadastro';

  await deps.repositorio.atualizarDataDescricaoSolicitacao({
    solicitacaoId: pendente.id,
    xdescServ: novaDescricao,
    fila
  });

  // A Conta pode ter alterado o perfil depois da leitura inicial. O serviço
  // verifica o cadastro atual e só pede os dados se ainda forem necessários.
  if (deps.dadosProfissionais) {
    await deps.dadosProfissionais.solicitar(medico.id);
    await deps.dadosProfissionais.retomar(medico.id);
  }

  const instanciaOficial = deps.instanciaOficialNome || 'notomed_oficial';
  await deps.enviarMensagem.enviarTexto({
    instanciaNome: instanciaOficial,
    contatoTelefone: telefoneMedico,
    texto: `Data registrada (${dataInformada}). A solicitação de nota de ${pendente.nomePaciente} continuará assim que os dados necessários estiverem completos.`
  });

  return {
    ok: true,
    solicitacaoId: pendente.id,
    dataInformada,
    fila
  };
}
