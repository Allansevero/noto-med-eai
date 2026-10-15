/**
 * Caso de uso: Iniciar um pedido de emissão de NFS-e sob demanda solicitado pelo médico.
 * Orquestra pré-filtro determinístico, extração semântica com Gemini, busca em cascata
 * de pacientes (Supabase -> Sheets -> Conversa) e notificação inicial no WhatsApp.
 */

import { randomUUID } from 'node:crypto';
import type { ConsultaCpfProvider } from '../../paciente/consulta-cpf-provider.js';
import { detectarPrePedidoNota } from '../regras/detectar-pedido-nota.js';
import { escolherDataConsulta } from '../regras/escolher-data-consulta.js';
import { escolherValorSugerido } from '../regras/escolher-valor-sugerido.js';
import {
  redigirConfirmacaoPedido,
  redigirEscolhaMultipla,
  redigirSolicitacaoDadosFaltantes
} from '../regras/redigir-mensagens-pedido.js';
import { resolverCascataFontes } from '../regras/resolver-cascata-fontes.js';
import type { FontePacientes } from '../io/fonte-pacientes.js';
import type { GeminiPedidoClient } from '../io/gemini-pedido-client.js';
import type { PedidosRepositorio } from '../io/pedidos-repositorio.js';
import type { PacienteEncontrado, PedidoNota } from '../tipos.js';

export interface IniciarPedidoNotaParams {
  medicoId: string;
  mensagemId: string;
  texto: string;
  telefoneMedico: string;
}

export interface IniciarPedidoNotaDeps {
  repositorio: PedidosRepositorio;
  fontesPacientes: FontePacientes[];
  geminiClient?: GeminiPedidoClient;
  consultaCpfProvider?: ConsultaCpfProvider;
  enviarMensagemAoMedico: (telefone: string, texto: string) => Promise<boolean>;
  gerarId?: () => string;
}

export type ResultadoIniciarPedido =
  | { tratado: true; status: 'aguardando_confirmacao' | 'aguardando_dados_faltantes' | 'aguardando_escolha_paciente'; pedido: PedidoNota }
  | { tratado: false; motivo?: string };

export async function iniciarPedidoNota(
  params: IniciarPedidoNotaParams,
  deps: IniciarPedidoNotaDeps
): Promise<ResultadoIniciarPedido> {
  const pre = detectarPrePedidoNota(params.texto);
  if (!pre.ehCandidatoPedido) {
    return { tratado: false, motivo: 'sem_gatilho_pedido' };
  }

  let nomeBuscado: string | null = null;
  let dataConsultaTexto: string | null = null;
  let valorExtraidoCentavos: number | null = pre.valorCentavos ?? null;

  if (deps.geminiClient) {
    const extraidoIa = await deps.geminiClient.extrairIntencaoPedido(params.texto);
    if (!extraidoIa.ehPedidoNota && !pre.cpfLimpo) {
      return { tratado: false, motivo: 'ia_descartou_intencao' };
    }
    nomeBuscado = extraidoIa.nomePaciente || null;
    dataConsultaTexto = extraidoIa.dataConsultaTexto || null;
    if (extraidoIa.valorCentavos && !valorExtraidoCentavos) {
      valorExtraidoCentavos = extraidoIa.valorCentavos;
    }
  }

  const termoBusca = {
    nome: nomeBuscado,
    telefone: pre.telefone || null,
    cpf: pre.cpfLimpo || null
  };

  const resultadosFontes = await executarBuscaCascata(deps.fontesPacientes, params.medicoId, termoBusca);
  const cascata = resolverCascataFontes(resultadosFontes);

  await deps.repositorio.cancelarPedidosAtivosAnteriores(params.medicoId);
  const refExterna = `ped_${params.mensagemId.replace(/\W/g, '').slice(-20)}_${(deps.gerarId || randomUUID)().slice(0, 8)}`;

  if (cascata.tipo === 'multiplos') {
    return tratarMultiplosPacientes(params, deps, cascata.opcoes, refExterna, nomeBuscado);
  }

  if (cascata.tipo === 'nenhum') {
    return tratarPacienteNaoEncontrado(params, deps, {
      nomeBuscado,
      cpfLimpo: pre.cpfLimpo,
      telefone: pre.telefone,
      valorCentavos: valorExtraidoCentavos,
      dataConsultaTexto,
      refExterna
    });
  }

  return tratarPacienteUnico(params, deps, {
    paciente: cascata.paciente,
    cpfFornecido: pre.cpfLimpo,
    telefoneFornecido: pre.telefone,
    valorExtraidoCentavos,
    dataConsultaTexto,
    refExterna
  });
}

async function executarBuscaCascata(
  fontes: FontePacientes[],
  medicoId: string,
  termo: { nome: string | null; telefone: string | null; cpf: string | null }
): Promise<Array<{ fonte: string; pacientes: PacienteEncontrado[] }>> {
  const lista: Array<{ fonte: string; pacientes: PacienteEncontrado[] }> = [];
  for (const f of fontes) {
    const res = await f.buscar(medicoId, termo).catch(() => []);
    lista.push({ fonte: f.nomeFonte, pacientes: res });
    if (res.length > 0) break; // Para na primeira fonte com resultados
  }
  return lista;
}

async function tratarMultiplosPacientes(
  params: IniciarPedidoNotaParams,
  deps: IniciarPedidoNotaDeps,
  opcoes: PacienteEncontrado[],
  refExterna: string,
  nomeBuscado: string | null
): Promise<ResultadoIniciarPedido> {
  const pedido = await deps.repositorio.salvarNovoPedido({
    medicoId: params.medicoId,
    mensagemId: params.mensagemId,
    status: 'aguardando_escolha_paciente',
    nomePaciente: nomeBuscado,
    candidatosMultiplos: opcoes,
    referenciaExterna: refExterna
  });

  const msg = redigirEscolhaMultipla(opcoes, nomeBuscado);
  await deps.enviarMensagemAoMedico(params.telefoneMedico, msg);
  return { tratado: true, status: 'aguardando_escolha_paciente', pedido };
}

async function tratarPacienteNaoEncontrado(
  params: IniciarPedidoNotaParams,
  deps: IniciarPedidoNotaDeps,
  dados: {
    nomeBuscado: string | null;
    cpfLimpo?: string | null;
    telefone?: string | null;
    valorCentavos?: number | null;
    dataConsultaTexto?: string | null;
    refExterna: string;
  }
): Promise<ResultadoIniciarPedido> {
  const precisaCpf = !dados.cpfLimpo;
  const precisaValor = !dados.valorCentavos;
  const precisaTelefone = !dados.telefone;

  const status = (precisaCpf || precisaValor || precisaTelefone)
    ? 'aguardando_dados_faltantes'
    : 'aguardando_confirmacao';

  const dataFinal = escolherDataConsulta({ textoData: dados.dataConsultaTexto });

  const pedido = await deps.repositorio.salvarNovoPedido({
    medicoId: params.medicoId,
    mensagemId: params.mensagemId,
    status,
    nomePaciente: dados.nomeBuscado || 'Paciente',
    cpfLimpo: dados.cpfLimpo,
    telefonePaciente: dados.telefone,
    valorCentavos: dados.valorCentavos,
    dataConsulta: dataFinal,
    origemDados: 'manual',
    referenciaExterna: dados.refExterna
  });

  if (status === 'aguardando_dados_faltantes') {
    const msg = redigirSolicitacaoDadosFaltantes({
      nomeBuscado: dados.nomeBuscado,
      precisaCpf,
      precisaValor,
      precisaTelefone
    });
    await deps.enviarMensagemAoMedico(params.telefoneMedico, msg);
  } else {
    const msg = redigirConfirmacaoPedido({
      nomePaciente: dados.nomeBuscado || 'Paciente',
      dataConsulta: dataFinal,
      valorCentavos: dados.valorCentavos!,
      precisaConfirmarValor: true
    });
    await deps.enviarMensagemAoMedico(params.telefoneMedico, msg);
  }

  return { tratado: true, status, pedido };
}

async function tratarPacienteUnico(
  params: IniciarPedidoNotaParams,
  deps: IniciarPedidoNotaDeps,
  dados: {
    paciente: PacienteEncontrado;
    cpfFornecido?: string | null;
    telefoneFornecido?: string | null;
    valorExtraidoCentavos?: number | null;
    dataConsultaTexto?: string | null;
    refExterna: string;
  }
): Promise<ResultadoIniciarPedido> {
  const cpfFinal = dados.cpfFornecido || dados.paciente.cpfLimpo || null;
  const telefoneFinal = dados.telefoneFornecido || dados.paciente.telefone || null;
  const valorFinal = escolherValorSugerido({
    valorTextoCentavos: dados.valorExtraidoCentavos,
    valorFonteCentavos: dados.paciente.valorSugeridoCentavos
  });
  const dataFinal = escolherDataConsulta({
    textoData: dados.dataConsultaTexto,
    dataSugeridaFonte: dados.paciente.dataConsultaSugerida
  });

  let avisoNomeCpf: string | null = null;
  let nomeFinal = dados.paciente.nome;

  if (cpfFinal && deps.consultaCpfProvider) {
    const consultaCpf = await deps.consultaCpfProvider.consultar(cpfFinal).catch(() => null);
    if (consultaCpf?.nome) {
      if (!nomesSaoCompativeis(dados.paciente.nome, consultaCpf.nome)) {
        avisoNomeCpf = `CPF cadastrado na Receita em nome de ${consultaCpf.nome}.`;
      }
      nomeFinal = consultaCpf.nome;
    }
  }

  const precisaCpf = !cpfFinal;
  const precisaValor = !valorFinal;
  const precisaTelefone = !telefoneFinal;

  const status = (precisaCpf || precisaValor || precisaTelefone)
    ? 'aguardando_dados_faltantes'
    : 'aguardando_confirmacao';

  const pedido = await deps.repositorio.salvarNovoPedido({
    medicoId: params.medicoId,
    mensagemId: params.mensagemId,
    status,
    pacienteId: dados.paciente.pacienteId,
    nomePaciente: nomeFinal,
    cpfLimpo: cpfFinal,
    telefonePaciente: telefoneFinal,
    dataConsulta: dataFinal,
    valorCentavos: valorFinal,
    origemDados: dados.paciente.origem,
    referenciaExterna: dados.refExterna
  });

  if (status === 'aguardando_dados_faltantes') {
    const msg = redigirSolicitacaoDadosFaltantes({
      nomeBuscado: nomeFinal,
      precisaCpf,
      precisaValor,
      precisaTelefone
    });
    await deps.enviarMensagemAoMedico(params.telefoneMedico, msg);
  } else {
    const msg = redigirConfirmacaoPedido({
      nomePaciente: nomeFinal,
      dataConsulta: dataFinal,
      valorCentavos: valorFinal!,
      avisoCpfDivergente: avisoNomeCpf,
      precisaConfirmarValor: true
    });
    await deps.enviarMensagemAoMedico(params.telefoneMedico, msg);
  }

  return { tratado: true, status, pedido };
}

function nomesSaoCompativeis(nomeA: string, nomeB: string): boolean {
  const limpa = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const a = limpa(nomeA);
  const b = limpa(nomeB);
  if (a === b) return true;
  const partesA = a.split(/\s+/);
  return partesA.length > 0 && b.includes(partesA[0]);
}
