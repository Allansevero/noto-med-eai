/**
 * Caso de uso: Processamento da resposta de aprovação do médico pelo WhatsApp.
 * Interpreta intenção (aprovação, recusa, ajuste de valor ou CPF), orquestra
 * a coleta de CPF e aciona diretamente a API de emissão existente sem duplicidade.
 */

import { interpretarRespostaMedico } from '../regras/interpretar-resposta-medico.js';
import type { CandidatosRepositorio } from '../io/candidatos-repositorio.js';
import type { EmissaoApiRepositorio } from '../../api/nfse/emissao-api-repositorio.js';
import type { ResultadoProcessarEmissaoApi } from '../../api/nfse/processar-solicitacao-emissao-api.js';
import type { CandidatoEmissao } from '../tipos.js';

export interface ProcessarRespostaMedicoParams {
  medicoId: string;
  textoRecebido: string;
  telefoneMedico: string;
}

export interface ProcessarRespostaMedicoDeps {
  repositorio: CandidatosRepositorio;
  emissaoApiRepo: EmissaoApiRepositorio;
  processarEmissaoApi: (payload: any, deps: { repositorio: EmissaoApiRepositorio }) => Promise<ResultadoProcessarEmissaoApi>;
  enviarMensagemAoMedico?: (telefone: string, texto: string) => Promise<boolean>;
  enviarMensagemAoPaciente?: (telefone: string, texto: string) => Promise<boolean>;
}

export type ResultadoRespostaMedico =
  | { tratado: true; acao: 'emissao_enfileirada'; solicitacaoId: string; candidato: CandidatoEmissao }
  | { tratado: true; acao: 'recusado'; candidato: CandidatoEmissao }
  | { tratado: true; acao: 'aguardando_cpf'; candidato: CandidatoEmissao }
  | { tratado: true; acao: 'cpf_solicitado_paciente'; candidato: CandidatoEmissao }
  | { tratado: true; acao: 'erro_emissao'; detalhe: string; candidato: CandidatoEmissao }
  | { tratado: false; motivo?: 'sem_candidato_pendente' | 'mensagem_ignorada' };

export async function processarRespostaMedicoCandidato(
  params: ProcessarRespostaMedicoParams,
  deps: ProcessarRespostaMedicoDeps
): Promise<ResultadoRespostaMedico> {
  const decisao = interpretarRespostaMedico(params.textoRecebido);
  if (decisao.acao === 'ignorar') {
    return { tratado: false, motivo: 'mensagem_ignorada' };
  }

  const candidato = await deps.repositorio.buscarUltimoAguardandoAprovacao(params.medicoId);
  if (!candidato) {
    return { tratado: false, motivo: 'sem_candidato_pendente' };
  }

  const nomePaciente = candidato.nomePaciente?.trim() || 'Paciente';

  if (decisao.acao === 'recusar') {
    await deps.repositorio.atualizarStatus(candidato.id, 'recusado');
    if (deps.enviarMensagemAoMedico) {
      await deps.enviarMensagemAoMedico(
        params.telefoneMedico,
        `Tudo bem! Cancelei a emissão da nota de ${nomePaciente}.`
      );
    }
    return { tratado: true, acao: 'recusado', candidato };
  }

  if (decisao.acao === 'pedir_cpf_paciente') {
    if (deps.enviarMensagemAoPaciente && candidato.telefonePaciente) {
      const primeiroNome = nomePaciente.split(/\s+/)[0] || '';
      const saudacao = primeiroNome && primeiroNome !== 'Paciente' ? `Olá, ${primeiroNome}!` : 'Olá!';
      await deps.enviarMensagemAoPaciente(
        candidato.telefonePaciente,
        `${saudacao} Para emitirmos sua nota fiscal da consulta, você poderia nos confirmar seu CPF por favor?`
      );
    }

    if (deps.enviarMensagemAoMedico) {
      await deps.enviarMensagemAoMedico(
        params.telefoneMedico,
        `Enviei uma mensagem no WhatsApp de ${nomePaciente} solicitando o CPF. Assim que responder, a nota será emitida automaticamente e eu te aviso!`
      );
    }

    return { tratado: true, acao: 'cpf_solicitado_paciente', candidato };
  }

  let cpfParaEmissao: string | null = null;

  if (decisao.acao === 'fornecer_cpf') {
    cpfParaEmissao = decisao.cpf;
    if (candidato.pacienteId) {
      await deps.repositorio.salvarCpfPaciente(params.medicoId, candidato.pacienteId, decisao.cpf);
    }
  } else {
    const paciente = await deps.repositorio.buscarPacientePorTelefone(params.medicoId, candidato.telefonePaciente);
    cpfParaEmissao = paciente?.cpfLimpo || null;
  }

  if (!cpfParaEmissao) {
    if (deps.enviarMensagemAoMedico) {
      await deps.enviarMensagemAoMedico(
        params.telefoneMedico,
        `Perfeito! Como ainda não temos o CPF de ${nomePaciente}, me envie o CPF dele aqui para emitir a NFS-e (ou responda "pedir" que solicito direto a ele).`
      );
    }
    return { tratado: true, acao: 'aguardando_cpf', candidato };
  }

  const valorFinalCentavos = (decisao.acao === 'aprovar' && decisao.valorAjustadoCentavos)
    ? decisao.valorAjustadoCentavos
    : candidato.valorCentavos;

  const resultadoApi = await deps.processarEmissaoApi(
    {
      ref: candidato.referenciaExterna,
      medicoId: params.medicoId,
      valor: valorFinalCentavos / 100,
      paciente: {
        cpf: cpfParaEmissao,
        nome: nomePaciente,
        telefone: candidato.telefonePaciente
      }
    },
    { repositorio: deps.emissaoApiRepo }
  );

  if (!resultadoApi.ok) {
    const detalheErro = resultadoApi.erro.mensagem || 'Falha ao enfileirar emissão';
    await deps.repositorio.atualizarStatus(candidato.id, 'erro_emissao');
    if (deps.enviarMensagemAoMedico) {
      await deps.enviarMensagemAoMedico(
        params.telefoneMedico,
        `Identifiquei uma pendência na configuração fiscal para emitir a nota de ${nomePaciente}: ${detalheErro}`
      );
    }
    return { tratado: true, acao: 'erro_emissao', detalhe: detalheErro, candidato };
  }

  const solicitacaoId = resultadoApi.resposta.solicitacaoId;
  await deps.repositorio.atualizarStatus(candidato.id, 'aprovado', {
    solicitacaoId,
    valorCentavos: valorFinalCentavos
  });

  const valorFormatado = (valorFinalCentavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  if (deps.enviarMensagemAoMedico) {
    await deps.enviarMensagemAoMedico(
      params.telefoneMedico,
      `Perfeito! A nota fiscal de ${nomePaciente} (R$ ${valorFormatado}) foi colocada na fila de emissão. Assim que for autorizada pela prefeitura, o PDF será enviado automaticamente para o paciente no WhatsApp e eu te aviso!`
    );
  }

  return { tratado: true, acao: 'emissao_enfileirada', solicitacaoId, candidato };
}
