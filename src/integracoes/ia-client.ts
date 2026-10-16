/**
 * Cliente HTTP para comunicação do Noto com o serviço /ia isolado.
 * Encapsula chamadas de detecção autônoma de candidatos a emissão e
 * aciona a autocorreção de erros fiscais sem intervenção humana.
 */

import type {
  RequisicaoDetectarCandidatos,
  RespostaDetectarCandidatos,
  RequisicaoAutocorrigirFalha,
  RespostaAutocorrigirFalha
} from '../../contratos/tipos-ia.js';
import { CODIGOS_ERRO_IA } from '../../contratos/codigos-erro.js';

export interface IaClientConfig {
  baseUrl: string;
  tokenInterno: string;
}

export class IaClient {
  constructor(private readonly config: IaClientConfig) {}

  async detectarCandidatos(dados: RequisicaoDetectarCandidatos): Promise<RespostaDetectarCandidatos> {
    try {
      const resp = await fetch(`${this.config.baseUrl}/v1/analise/detectar-candidatos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': this.config.tokenInterno
        },
        body: JSON.stringify(dados)
      });

      const body = await resp.json() as RespostaDetectarCandidatos;
      return body;
    } catch (err: any) {
      return {
        sucesso: false,
        codigo: CODIGOS_ERRO_IA.PROVEDOR_IA_INDISPONIVEL,
        mensagem: `Falha na comunicação com o serviço de IA: ${err?.message || 'erro de rede'}`
      };
    }
  }

  async autocorrigirFalha(dados: RequisicaoAutocorrigirFalha): Promise<RespostaAutocorrigirFalha> {
    try {
      const resp = await fetch(`${this.config.baseUrl}/v1/analise/autocorrigir-falha`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': this.config.tokenInterno
        },
        body: JSON.stringify(dados)
      });

      const body = await resp.json() as RespostaAutocorrigirFalha;
      return body;
    } catch (err: any) {
      return {
        sucesso: false,
        codigo: CODIGOS_ERRO_IA.ERRO_INTERNO_IA,
        mensagem: `Falha ao solicitar autocorreção à IA: ${err?.message || 'erro desconhecido'}`
      };
    }
  }
}
