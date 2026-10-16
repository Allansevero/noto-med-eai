/**
 * Caso de uso: Tratar a resposta do médico durante um diálogo ativo de pedido de nota.
 * Executa confirmação de valor, escolha de paciente em lista, coleta de dados faltantes
 * e aciona diretamente a API de emissão (processarSolicitacaoEmissaoApi) sem alterar o worker.
 */

import type { EmissaoApiRepositorio } from '../../api/nfse/emissao-api-repositorio.js';
import type { ResultadoProcessarEmissaoApi } from '../../api/nfse/processar-solicitacao-emissao-api.js';
import { interpretarRespostaPedido } from '../regras/interpretar-resposta-pedido.js';
import {
  redigirCancelamentoPedido,
  redigirConfirmacaoPedido,
  redigirSolicitacaoDadosFaltantes,
  redigirSucessoEmissao
} from '../regras/redigir-mensagens-pedido.js';
import type { PedidosRepositorio } from '../io/pedidos-repositorio.js';
import type { PacienteEncontrado, PedidoNota } from '../tipos.js';

export interface ResponderPedidoNotaParams {
  medicoId: string;
  texto: string;
  telefoneMedico: string;
}

export interface ResponderPedidoNotaDeps {
  repositorio: PedidosRepositorio;
  emissaoApiRepo: EmissaoApiRepositorio;
  processarEmissaoApi: (payload: any, deps: { repositorio: EmissaoApiRepositorio }) => Promise<ResultadoProcessarEmissaoApi>;
  enviarMensagemAoMedico: (telefone: string, texto: string) => Promise<boolean>;
}

export type ResultadoRespostaPedido =
  | { tratado: true; acao: 'emissao_enfileirada' | 'cancelado' | 'dados_atualizados' | 'paciente_selecionado'; pedido: PedidoNota }
  | { tratado: false; motivo?: string };

export async function responderPedidoNota(
  params: ResponderPedidoNotaParams,
  deps: ResponderPedidoNotaDeps
): Promise<ResultadoRespostaPedido> {
  const pedidoAtivo = await deps.repositorio.buscarPedidoAtivoPorMedico(params.medicoId);
  if (!pedidoAtivo) {
    return { tratado: false, motivo: 'sem_pedido_ativo' };
  }

  const decisao = interpretarRespostaPedido(params.texto);
  if (decisao.acao === 'ignorar') {
    return { tratado: false, motivo: 'resposta_ignorada' };
  }

  if (decisao.acao === 'cancelar') {
    await deps.repositorio.atualizarStatusPedido(pedidoAtivo.id, 'cancelado');
    const msg = redigirCancelamentoPedido(pedidoAtivo.nomePaciente);
    await deps.enviarMensagemAoMedico(params.telefoneMedico, msg);
    return { tratado: true, acao: 'cancelado', pedido: { ...pedidoAtivo, status: 'cancelado' } };
  }

  if (pedidoAtivo.status === 'aguardando_escolha_paciente' && decisao.acao === 'escolher_opcao') {
    return tratarEscolhaOpcao(params, deps, pedidoAtivo, decisao.indice);
  }

  if (pedidoAtivo.status === 'aguardando_dados_faltantes' && decisao.acao === 'fornecer_dados') {
    return tratarDadosFornecidos(params, deps, pedidoAtivo, decisao);
  }

  if (decisao.acao === 'confirmar') {
    return tratarConfirmacaoEmissao(params, deps, pedidoAtivo, decisao.valorAjustadoCentavos);
  }

  return { tratado: false, motivo: 'acao_nao_aplicavel_ao_estado' };
}

async function tratarEscolhaOpcao(
  params: ResponderPedidoNotaParams,
  deps: ResponderPedidoNotaDeps,
  pedido: PedidoNota,
  indice: number
): Promise<ResultadoRespostaPedido> {
  const opcoes = pedido.candidatosMultiplos as PacienteEncontrado[] | undefined;
  if (!opcoes || !opcoes[indice]) {
    await deps.enviarMensagemAoMedico(
      params.telefoneMedico,
      'Opção inválida. Por favor, responda com o número correspondente à lista.'
    );
    return { tratado: true, acao: 'paciente_selecionado', pedido };
  }

  const escolhido = opcoes[indice];
  const valorFinal = pedido.valorCentavos || escolhido.valorSugeridoCentavos || null;
  const cpfFinal = escolhido.cpfLimpo || pedido.cpfLimpo || null;
  const telefoneFinal = escolhido.telefone || pedido.telefonePaciente || null;

  const precisaCpf = !cpfFinal;
  const precisaValor = !valorFinal;
  const precisaTelefone = !telefoneFinal;

  const novoStatus = (precisaCpf || precisaValor || precisaTelefone)
    ? 'aguardando_dados_faltantes'
    : 'aguardando_confirmacao';

  await deps.repositorio.atualizarStatusPedido(pedido.id, novoStatus, {
    nomePaciente: escolhido.nome,
    cpfLimpo: cpfFinal ?? undefined,
    telefonePaciente: telefoneFinal ?? undefined,
    valorCentavos: valorFinal ?? undefined
  });

  const pedidoAtualizado: PedidoNota = {
    ...pedido,
    nomePaciente: escolhido.nome,
    cpfLimpo: cpfFinal,
    telefonePaciente: telefoneFinal,
    valorCentavos: valorFinal,
    status: novoStatus
  };

  if (novoStatus === 'aguardando_dados_faltantes') {
    const msg = redigirSolicitacaoDadosFaltantes({
      nomeBuscado: escolhido.nome,
      precisaCpf,
      precisaValor,
      precisaTelefone
    });
    await deps.enviarMensagemAoMedico(params.telefoneMedico, msg);
  } else {
    const msg = redigirConfirmacaoPedido({
      nomePaciente: escolhido.nome,
      dataConsulta: pedido.dataConsulta || 'Hoje',
      valorCentavos: valorFinal!,
      precisaConfirmarValor: true
    });
    await deps.enviarMensagemAoMedico(params.telefoneMedico, msg);
  }

  return { tratado: true, acao: 'paciente_selecionado', pedido: pedidoAtualizado };
}

async function tratarDadosFornecidos(
  params: ResponderPedidoNotaParams,
  deps: ResponderPedidoNotaDeps,
  pedido: PedidoNota,
  dados: { cpf?: string; telefone?: string; valorCentavos?: number }
): Promise<ResultadoRespostaPedido> {
  const cpfFinal = dados.cpf || pedido.cpfLimpo || null;
  const telefoneFinal = dados.telefone || pedido.telefonePaciente || null;
  const valorFinal = dados.valorCentavos || pedido.valorCentavos || null;

  const precisaCpf = !cpfFinal;
  const precisaValor = !valorFinal;
  const precisaTelefone = !telefoneFinal;

  const novoStatus = (precisaCpf || precisaValor || precisaTelefone)
    ? 'aguardando_dados_faltantes'
    : 'aguardando_confirmacao';

  await deps.repositorio.atualizarStatusPedido(pedido.id, novoStatus, {
    cpfLimpo: cpfFinal ?? undefined,
    telefonePaciente: telefoneFinal ?? undefined,
    valorCentavos: valorFinal ?? undefined
  });

  const pedidoAtualizado: PedidoNota = {
    ...pedido,
    cpfLimpo: cpfFinal,
    telefonePaciente: telefoneFinal,
    valorCentavos: valorFinal,
    status: novoStatus
  };

  if (novoStatus === 'aguardando_dados_faltantes') {
    const msg = redigirSolicitacaoDadosFaltantes({
      nomeBuscado: pedido.nomePaciente,
      precisaCpf,
      precisaValor,
      precisaTelefone
    });
    await deps.enviarMensagemAoMedico(params.telefoneMedico, msg);
  } else {
    const msg = redigirConfirmacaoPedido({
      nomePaciente: pedido.nomePaciente || 'Paciente',
      dataConsulta: pedido.dataConsulta || 'Hoje',
      valorCentavos: valorFinal!,
      precisaConfirmarValor: true
    });
    await deps.enviarMensagemAoMedico(params.telefoneMedico, msg);
  }

  return { tratado: true, acao: 'dados_atualizados', pedido: pedidoAtualizado };
}

async function tratarConfirmacaoEmissao(
  params: ResponderPedidoNotaParams,
  deps: ResponderPedidoNotaDeps,
  pedido: PedidoNota,
  valorAjustadoCentavos?: number
): Promise<ResultadoRespostaPedido> {
  const valorFinalCentavos = valorAjustadoCentavos || pedido.valorCentavos;
  if (!valorFinalCentavos || valorFinalCentavos <= 0) {
    await deps.enviarMensagemAoMedico(
      params.telefoneMedico,
      'Por favor, informe o valor da consulta para emitirmos a nota (ex: *400* ou *R$ 350*).'
    );
    return { tratado: true, acao: 'dados_atualizados', pedido };
  }

  if (!pedido.cpfLimpo) {
    await deps.enviarMensagemAoMedico(
      params.telefoneMedico,
      'Ainda precisamos do CPF do paciente para emitir a NFS-e. Por favor, envie o CPF.'
    );
    return { tratado: true, acao: 'dados_atualizados', pedido };
  }

  const payloadEmissao = {
    ref: pedido.referenciaExterna,
    medicoId: params.medicoId,
    valor: valorFinalCentavos / 100,
    datasConsultas: pedido.dataConsulta,
    paciente: {
      cpf: pedido.cpfLimpo,
      nome: pedido.nomePaciente || 'Paciente',
      telefone: pedido.telefonePaciente || null
    }
  };

  const resultadoApi = await deps.processarEmissaoApi(payloadEmissao, { repositorio: deps.emissaoApiRepo });

  if (!resultadoApi.ok) {
    const erroTexto = resultadoApi.erro.mensagem || 'Falha na validação fiscal';
    await deps.repositorio.atualizarStatusPedido(pedido.id, 'erro_emissao');
    await deps.enviarMensagemAoMedico(
      params.telefoneMedico,
      `Identifiquei uma pendência na configuração fiscal para emitir esta nota: ${erroTexto}`
    );
    return { tratado: true, acao: 'emissao_enfileirada', pedido: { ...pedido, status: 'erro_emissao' } };
  }

  const solicitacaoId = resultadoApi.resposta.solicitacaoId;
  await deps.repositorio.atualizarStatusPedido(pedido.id, 'aprovado', {
    solicitacaoId,
    valorCentavos: valorFinalCentavos
  });

  const msgSucesso = redigirSucessoEmissao(pedido.nomePaciente || 'Paciente', valorFinalCentavos);
  await deps.enviarMensagemAoMedico(params.telefoneMedico, msgSucesso);

  return {
    tratado: true,
    acao: 'emissao_enfileirada',
    pedido: { ...pedido, status: 'aprovado', solicitacaoId, valorCentavos: valorFinalCentavos }
  };
}
