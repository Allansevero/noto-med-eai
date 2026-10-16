/**
 * Caso de uso: Processamento de mídia recebida do paciente (imagem ou PDF).
 * Invoca a leitura multimodal do Gemini, valida o comprovante, verifica duplicidade
 * de faturamento, registra o candidato e notifica o médico com humanidade.
 */

import { validarComprovante } from '../regras/validar-comprovante.js';
import { redigirNotificacaoCandidato } from '../regras/redigir-notificacao-candidato.js';
import type { GeminiComprovanteClient } from '../io/gemini-comprovante-client.js';
import type { CandidatosRepositorio } from '../io/candidatos-repositorio.js';
import type { CandidatoEmissao } from '../tipos.js';

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

  const validacao = validarComprovante(extracao);
  if (!validacao.valido) {
    return { ok: false, motivo: validacao.motivo! };
  }

  const txidLimpo = extracao.idTransacao?.trim() || null;
  const ref = txidLimpo
    ? `comp_pix_${txidLimpo.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}`
    : `comp_msg_${params.mensagemId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80)}`;

  const jaFaturado = await deps.repositorio.jaExisteFaturamento(params.medicoId, {
    txid: txidLimpo,
    referenciaExterna: ref,
    telefonePaciente: params.telefonePaciente,
    valorCentavos: extracao.valorCentavos!
  });

  if (jaFaturado) {
    return { ok: false, motivo: 'ja_faturado' };
  }

  const existente = await deps.repositorio.buscarCandidatoPorMensagem(params.medicoId, params.mensagemId);
  if (existente) {
    return { ok: true, status: 'ja_registrado', candidato: existente };
  }

  const paciente = await deps.repositorio.buscarPacientePorTelefone(params.medicoId, params.telefonePaciente);
  const temCpf = Boolean(paciente?.cpfLimpo);
  const nomeFinal = extracao.pagadorNome || paciente?.nome || null;

  const candidato = await deps.repositorio.salvarCandidato({
    medicoId: params.medicoId,
    pacienteId: paciente?.id,
    mensagemId: params.mensagemId,
    conversaId: params.conversaId,
    telefonePaciente: params.telefonePaciente,
    nomePaciente: nomeFinal,
    valorCentavos: extracao.valorCentavos!,
    dataPagamento: extracao.dataPagamento,
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
