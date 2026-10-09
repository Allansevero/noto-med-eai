/**
 * Orquestrador do envio final da NFS-e.
 * Executa a proteção fiscal imediatamente antes da chamada à API emissora,
 * impedindo qualquer chamada à rede se os critérios não forem atendidos.
 */

import { validarProtecaoFiscal, type DadosValidacaoEmissao } from '../regras/validar-protecao-fiscal.js';
import type { RastreadorLatencia } from '../regras/medir-etapas.js';

export interface ProvedorEmissaoNfse {
  emitir(payload: Record<string, unknown>): Promise<{ sucesso: boolean; numeroNota?: string; erro?: string }>;
}

export interface RequisicaoTransmissao {
  dadosValidacao: DadosValidacaoEmissao;
  payloadNfse: Record<string, unknown>;
  rastreador?: RastreadorLatencia;
}

export type RespostaTransmissao =
  | { status: 'emitida'; numeroNota: string; duracaoTotalMs?: number }
  | { status: 'bloqueada_fiscal'; motivo: string; detalhe?: string }
  | { status: 'erro_emissao'; erro: string };

export async function transmitirNfse(
  requisicao: RequisicaoTransmissao,
  provedorEmissao: ProvedorEmissaoNfse
): Promise<RespostaTransmissao> {
  const finalizarValidacao = requisicao.rastreador?.iniciarEtapa('validacao_protecao_fiscal');
  const validacao = validarProtecaoFiscal(requisicao.dadosValidacao);
  finalizarValidacao?.();

  if (!validacao.podeTransmitir) {
    return {
      status: 'bloqueada_fiscal',
      motivo: validacao.motivo,
      detalhe: validacao.detalhe
    };
  }

  const finalizarChamadaFiscal = requisicao.rastreador?.iniciarEtapa('transmissao_api_nfse');
  const respostaApi = await provedorEmissao.emitir(requisicao.payloadNfse);
  finalizarChamadaFiscal?.();

  if (!respostaApi.sucesso || !respostaApi.numeroNota) {
    return {
      status: 'erro_emissao',
      erro: respostaApi.erro || 'Falha desconhecida na API de emissão'
    };
  }

  return {
    status: 'emitida',
    numeroNota: respostaApi.numeroNota,
    duracaoTotalMs: requisicao.rastreador?.tempoTotalMs()
  };
}
