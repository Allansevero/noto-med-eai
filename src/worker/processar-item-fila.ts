/**
 * Caso de uso: Processamento individual de um item da fila de emissão de NFS-e.
 * Orquestra tentativas, gravação de nota autorizada, envio do PDF ao paciente
 * e notificações de falha ao médico ou desenvolvedor (seção 3.2, itens 5 a 8).
 */

import {
  excedeuTentativasEmissao,
  calcularProximaTentativa
} from './calcular-proxima-tentativa.js';
import type { ItemFilaComTentativas, FilaRepositorio } from './fila-repositorio.js';
import type { EmissorDpsService } from './emissor-dps-service.js';
import type { EnviarPdfDanfse } from '../whatsapp/enviar-pdf-danfse.js';
import type { NotificadorAlertas } from './notificar-erro-medico.js';

export interface ProcessarItemFilaDeps {
  filaRepositorio: FilaRepositorio;
  emissorDps: EmissorDpsService;
  enviarPdfDanfse: EnviarPdfDanfse;
  notificadorAlertas: NotificadorAlertas;
  agora?: () => Date;
}

export type ResultadoProcessarItem =
  | { ok: true; status: 'emitida'; chaveAcesso: string }
  | { ok: false; status: 'reagendada' | 'erro_definitivo' | 'erro_inesperado'; motivo?: string };

export async function processarItemFila(
  item: ItemFilaComTentativas,
  deps: ProcessarItemFilaDeps
): Promise<ResultadoProcessarItem> {
  const dataAtual = deps.agora ? deps.agora() : new Date();
  const tentativaAtual = item.tentativas + 1;

  try {
    const emissao = await deps.emissorDps.emitir(item);
    if (emissao.sucesso) {
      await tratarSucessoEmissao(item, emissao, deps);
      return { ok: true, status: 'emitida', chaveAcesso: emissao.chaveAcesso };
    }
    return tratarFalhaEmissao(item, tentativaAtual, emissao.erro, dataAtual, deps);
  } catch (erro: any) {
    return tratarExcecaoInesperada(item, tentativaAtual, erro, dataAtual, deps);
  }
}

async function tratarSucessoEmissao(item: ItemFilaComTentativas, emissao: any, deps: ProcessarItemFilaDeps): Promise<void> {
  await deps.filaRepositorio.registrarSucesso({
    solicitacaoId: item.id,
    medicoId: item.medicoId,
    chaveAcesso: emissao.chaveAcesso,
    ndps: emissao.ndps,
    serie: emissao.serie,
    competencia: emissao.competencia,
    dataEmissao: emissao.dataEmissao,
    valorServicosCentavos: emissao.valorServicosCentavos,
    xmlStoragePath: emissao.xmlStoragePath,
    pdfStoragePath: emissao.pdfStoragePath,
    respostaSefinRaw: emissao.respostaSefinRaw
  });

  const contexto = await deps.filaRepositorio.buscarContextoEnvio(item.id);
  if (contexto) {
    await deps.enviarPdfDanfse.enviarPdf({
      instanciaNome: contexto.instanciaNome,
      contatoTelefone: contexto.contatoTelefone,
      pdfPathOuUrl: emissao.pdfStoragePath,
      nomeArquivo: `DANFSe-${emissao.ndps}.pdf`
    });
  }
}

async function tratarFalhaEmissao(
  item: ItemFilaComTentativas,
  tentativaAtual: number,
  erro: string,
  dataAtual: Date,
  deps: ProcessarItemFilaDeps
): Promise<ResultadoProcessarItem> {
  if (excedeuTentativasEmissao(tentativaAtual)) {
    await deps.filaRepositorio.marcarFalhaDefinitiva({ solicitacaoId: item.id, tentativas: tentativaAtual, erro });
    const contexto = await deps.filaRepositorio.buscarContextoEnvio(item.id);
    if (contexto) {
      await deps.notificadorAlertas.notificarMedicoWhatsApp({
        telefoneMedico: contexto.telefoneMedico,
        nomePaciente: contexto.nomePaciente,
        valorCentavos: item.valorServicoCentavos,
        motivoErro: erro
      });
    }
    return { ok: false, status: 'erro_definitivo', motivo: erro };
  }

  const proximaTentativaEm = calcularProximaTentativa(tentativaAtual, dataAtual);
  await deps.filaRepositorio.reagendarTentativa({ solicitacaoId: item.id, tentativas: tentativaAtual, proximaTentativaEm, erro });
  return { ok: false, status: 'reagendada', motivo: erro };
}

async function tratarExcecaoInesperada(
  item: ItemFilaComTentativas,
  tentativaAtual: number,
  erro: any,
  dataAtual: Date,
  deps: ProcessarItemFilaDeps
): Promise<ResultadoProcessarItem> {
  const mensagemErro = erro?.message || 'Erro inesperado';
  await deps.notificadorAlertas.notificarDesenvolvedorEmail({
    assunto: `[NFS-e Alerta] Exceção no processamento da solicitação ${item.id}`,
    detalhesErro: String(erro?.stack || erro),
    solicitacaoId: item.id,
    medicoId: item.medicoId
  });
  return tratarFalhaEmissao(item, tentativaAtual, mensagemErro, dataAtual, deps);
}
