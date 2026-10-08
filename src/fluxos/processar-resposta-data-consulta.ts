/**
 * Caso de uso: Processamento da resposta do médico com a data da consulta.
 * Quando o médico responde à pergunta enviada pelo WhatsApp oficial,
 * atualiza a descrição legal da NFS-e com a data informada e avança a fila
 * para 'pronta' (se paciente já possui CPF) ou 'pendente_cadastro'.
 */

import type { ComunicadorNoto } from '../conversa/comunicador-noto.js';
import { montarDescricaoServico } from '../emissao/montar-descricao-servico.js';
import type { AtendimentoRepositorio } from '../atendimento/atendimento-repositorio.js';
import type { EnviarMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';
import type { DadosProfissionaisService } from '../conta/dados-profissionais-service.js';

export interface ProcessarRespostaDataDeps {
  repositorio: AtendimentoRepositorio;
  comunicadorNoto?: ComunicadorNoto;
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

  try {
    if (deps.comunicadorNoto) {
      const resultado = await deps.comunicadorNoto.enviar({
        medicoId: medico.id, chave: `data_salva:${pendente.id}`,
        evento: 'data_salva', solicitacaoId: pendente.id, mensagemRecebida: textoResposta,
        dados: { dataInformada }
      });
      if (!resultado.sucesso) console.warn('[processarRespostaDataConsulta] Comunicação não concluída', { evento: 'data_salva' });
    } else {
      console.warn('[processarRespostaDataConsulta] Comunicador indisponível', { evento: 'data_salva' });
    }
  } catch {
    console.warn('[processarRespostaDataConsulta] Comunicação falhou', { evento: 'data_salva' });
  }

  return {
    ok: true,
    solicitacaoId: pendente.id,
    dataInformada,
    fila
  };
}
