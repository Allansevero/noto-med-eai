/**
 * Caso de uso: Processamento de mídia recebida do paciente (imagem ou PDF).
 * Invoca leitura multimodal do Gemini, salva oportunisticamente CPFs extraídos
 * de documentos/notas, infere a data da consulta anterior ao comprovante (híbrido
 * determinístico + Gemini), verifica emissões anteriores no chat e notifica o médico.
 */

import { validarComprovante } from '../regras/validar-comprovante.js';
import { redigirNotificacaoCandidato } from '../regras/redigir-notificacao-candidato.js';
import { inferirDataConsultaHistorico } from '../../emissao/regras/inferir-data-consulta-historico.js';
import { foiFaturadoPosteriormente } from '../../agente-fiscal/regras/correlacionar-consulta-pagamento.js';
import { extrairCpfConversaSegura } from '../../paciente/extrair-cpf-texto.js';
import type { GeminiComprovanteClient } from '../io/gemini-comprovante-client.js';
import type { CandidatosRepositorio, MensagemConversaRegistro } from '../io/candidatos-repositorio.js';
import type { CandidatoEmissao, DadosComprovanteExtraidos } from '../tipos.js';

export interface ProcessarMidiaComprovanteParams {
  medicoId: string;
  conversaId: string;
  mensagemId: string;
  telefonePaciente: string;
  base64: string;
  mimeType?: string;
}

export interface ProcessarMidiaComprovanteDeps {
  geminiClient: GeminiComprovanteClient;
  repositorio: CandidatosRepositorio;
  enviarMensagemAoMedico?: (telefoneMedico: string, texto: string) => Promise<boolean>;
}

export type ResultadoProcessarMidia =
  | { ok: true; status: 'candidato_notificado'; candidato: CandidatoEmissao }
  | { ok: true; status: 'ja_registrado'; candidato: CandidatoEmissao }
  | { ok: false; motivo: 'nao_eh_comprovante' | 'eh_nota_fiscal' | 'valor_invalido' | 'data_futura' | 'ja_faturado' | 'medico_sem_telefone' };

export async function processarMidiaComprovante(
  params: ProcessarMidiaComprovanteParams,
  deps: ProcessarMidiaComprovanteDeps
): Promise<ResultadoProcessarMidia> {
  const extracao = await deps.geminiClient.analisarMidia({
    base64: params.base64,
    mimeType: params.mimeType
  });

  const cpfExtraidoMidia = extracao.tomadorCpf || extracao.pagadorCpf || null;
  let paciente = (cpfExtraidoMidia && typeof deps.repositorio.buscarPacientePorTelefone === 'function')
    ? await deps.repositorio.buscarPacientePorTelefone(params.medicoId, params.telefonePaciente)
    : null;

  if (paciente?.id && !paciente.cpfLimpo && cpfExtraidoMidia) {
    await deps.repositorio.salvarCpfPaciente(params.medicoId, paciente.id, cpfExtraidoMidia);
    paciente.cpfLimpo = cpfExtraidoMidia;
  }

  const validacao = validarComprovante(extracao);
  if (!validacao.valido) {
    return { ok: false, motivo: validacao.motivo! };
  }

  if (!paciente && typeof deps.repositorio.buscarPacientePorTelefone === 'function') {
    paciente = await deps.repositorio.buscarPacientePorTelefone(params.medicoId, params.telefonePaciente);
  }

  const txidLimpo = extracao.idTransacao?.trim() || null;
  const ref = txidLimpo
    ? `comp_pix_${txidLimpo.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}`
    : `comp_msg_${params.mensagemId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}`;

  const jaFaturadoBanco = await deps.repositorio.jaExisteFaturamento(params.medicoId, {
    txid: txidLimpo,
    referenciaExterna: ref,
    telefonePaciente: params.telefonePaciente,
    valorCentavos: extracao.valorCentavos!
  });
  if (jaFaturadoBanco) {
    return { ok: false, motivo: 'ja_faturado' };
  }

  const existente = await deps.repositorio.buscarCandidatoPorMensagem(params.medicoId, params.mensagemId);
  if (existente) {
    return { ok: true, status: 'ja_registrado', candidato: existente };
  }

  const mensagens = deps.repositorio.buscarMensagensConversa
    ? await deps.repositorio.buscarMensagensConversa(params.conversaId)
    : [];

  const contexto = await analisarContextoConversaComprovante(
    mensagens,
    params.mensagemId,
    extracao,
    deps.geminiClient
  );
  if (contexto.jaFaturadoNoChat) {
    return { ok: false, motivo: 'ja_faturado' };
  }

  let cpfFinal = paciente?.cpfLimpo || cpfExtraidoMidia || contexto.cpfHistorico;
  if (paciente?.id && !paciente.cpfLimpo && cpfFinal) {
    await deps.repositorio.salvarCpfPaciente(params.medicoId, paciente.id, cpfFinal);
  }

  const temCpf = Boolean(cpfFinal);
  const nomeFinal = extracao.pagadorNome || extracao.tomadorNome || paciente?.nome || null;

  const candidato = await deps.repositorio.salvarCandidato({
    medicoId: params.medicoId,
    pacienteId: paciente?.id,
    mensagemId: params.mensagemId,
    conversaId: params.conversaId,
    telefonePaciente: params.telefonePaciente,
    nomePaciente: nomeFinal,
    valorCentavos: extracao.valorCentavos!,
    dataPagamento: extracao.dataPagamento,
    dataConsulta: contexto.dataConsultaBr,
    idTransacao: txidLimpo,
    tipoPagamento: extracao.tipo || 'pix',
    dadosBrutos: extracao,
    referenciaExterna: ref
  });

  const medico = await deps.repositorio.obterDadosMedico(params.medicoId);
  if (medico?.telefone && deps.enviarMensagemAoMedico) {
    const textoMensagem = redigirNotificacaoCandidato(
      {
        nomePaciente: nomeFinal,
        valorCentavos: extracao.valorCentavos!,
        dataPagamento: extracao.dataPagamento,
        dataConsulta: contexto.dataConsultaBr,
        tipoPagamento: extracao.tipo,
        temCpf
      },
      medico.nomeCompleto
    );

    await deps.enviarMensagemAoMedico(medico.telefone, textoMensagem);
    await deps.repositorio.marcarNotificado(candidato.id);
  }

  return { ok: true, status: 'candidato_notificado', candidato };
}

async function analisarContextoConversaComprovante(
  mensagens: MensagemConversaRegistro[],
  mensagemId: string,
  extracao: DadosComprovanteExtraidos,
  geminiClient: GeminiComprovanteClient
): Promise<{
  jaFaturadoNoChat: boolean;
  dataConsultaBr: string | null;
  cpfHistorico: string | null;
}> {
  if (extracao.dataConsultaReferencia) {
    const [ano, mes, dia] = extracao.dataConsultaReferencia.split('-');
    if (mensagens.length === 0) {
      return { jaFaturadoNoChat: false, dataConsultaBr: `${dia}/${mes}/${ano}`, cpfHistorico: null };
    }
  }

  if (mensagens.length === 0) {
    const padrao = extracao.dataPagamento ? formatarIsoBr(extracao.dataPagamento) : null;
    return { jaFaturadoNoChat: false, dataConsultaBr: padrao, cpfHistorico: null };
  }

  const idx = mensagens.findIndex(m => m.id === mensagemId || (m.payloadBruto as any)?.key?.id === mensagemId);
  const anteriores = idx >= 0 ? mensagens.slice(0, idx) : mensagens;
  const posteriores = idx >= 0 ? mensagens.slice(idx + 1) : [];
  const msgPag: MensagemConversaRegistro = idx >= 0
    ? mensagens[idx]
    : {
        id: mensagemId,
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        criadoEm: extracao.dataPagamento ? new Date(`${extracao.dataPagamento}T12:00:00Z`) : new Date()
      };

  if (posteriores.length > 0 && foiFaturadoPosteriormente(msgPag, posteriores)) {
    return { jaFaturadoNoChat: true, dataConsultaBr: null, cpfHistorico: null };
  }

  const cpfHistorico = extrairCpfConversaSegura(
    mensagens.map(m => ({ direcao: m.direcao, texto: m.conteudo }))
  );

  const inf = inferirDataConsultaHistorico({
    mensagensAnteriores: anteriores,
    msgPagamento: msgPag,
    mensagensPosteriores: posteriores
  });

  if (inf.ambiguo && typeof geminiClient.inferirDataConsultaConversa === 'function') {
    const mensagensComTexto = anteriores
      .filter(m => Boolean(m.conteudo?.trim()))
      .map(m => ({
        direcao: m.direcao,
        texto: m.conteudo!.trim(),
        criadoEmIso: (m.criadoEm instanceof Date ? m.criadoEm : new Date(m.criadoEm)).toISOString()
      }));

    const resolvidaIa = await geminiClient.inferirDataConsultaConversa({
      mensagens: mensagensComTexto,
      dataPagamentoIso: extracao.dataPagamento || inf.dataConsultaIso
    });
    if (resolvidaIa) {
      return { jaFaturadoNoChat: false, dataConsultaBr: resolvidaIa.dataConsultaBr, cpfHistorico };
    }
  }

  return {
    jaFaturadoNoChat: false,
    dataConsultaBr: inf.dataConsultaFormatada || (extracao.dataPagamento ? formatarIsoBr(extracao.dataPagamento) : null),
    cpfHistorico
  };
}

function formatarIsoBr(iso: string): string {
  const [ano, mes, dia] = iso.split('-');
  return dia && mes && ano ? `${dia}/${mes}/${ano}` : iso;
}

