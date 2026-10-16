/**
 * Cliente HTTP para comunicação do Noto com o serviço /fiscal isolado.
 * Encapsula as chamadas de rede internas via cabeçalho X-Internal-Token,
 * garantindo que o Noto nunca acesse diretamente o certificado A1 nem chaves privadas.
 */

import type {
  RequisicaoSalvarCertificado,
  RespostaSalvarCertificado,
  RequisicaoEmitirNota,
  RespostaEmitirNota,
  ParametrosFiscaisExtraidos
} from '../../contratos/tipos-fiscal.js';
import { CODIGOS_ERRO_FISCAL } from '../../contratos/codigos-erro.js';

export interface FiscalClientConfig {
  baseUrl: string;
  tokenInterno: string;
}

export class FiscalClient {
  constructor(private readonly config: FiscalClientConfig) {}

  async salvarCertificado(dados: RequisicaoSalvarCertificado): Promise<RespostaSalvarCertificado> {
    try {
      const resp = await fetch(`${this.config.baseUrl}/v1/onboarding/certificado`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': this.config.tokenInterno
        },
        body: JSON.stringify(dados)
      });

      const body = await resp.json() as RespostaSalvarCertificado;
      return body;
    } catch (err: any) {
      return {
        sucesso: false,
        codigo: CODIGOS_ERRO_FISCAL.SERPRO_INDISPONIVEL,
        mensagem: `Falha na comunicação com o serviço fiscal: ${err?.message || 'erro de rede'}`
      };
    }
  }

  async emitirNota(dados: RequisicaoEmitirNota): Promise<RespostaEmitirNota> {
    try {
      const resp = await fetch(`${this.config.baseUrl}/v1/notas/emitir`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': this.config.tokenInterno,
          'Idempotency-Key': dados.pedidoId
        },
        body: JSON.stringify(dados)
      });

      const body = await resp.json() as RespostaEmitirNota;
      return body;
    } catch (err: any) {
      return {
        sucesso: false,
        pedidoId: dados.pedidoId,
        status: 'rejeitada',
        codigo: CODIGOS_ERRO_FISCAL.ERRO_INTERNO_FISCAL,
        mensagem: `Falha de rede ao emitir nota fiscal no serviço fiscal: ${err?.message || 'erro desconhecido'}`
      };
    }
  }

  async obterParametrosFiscais(medicoId: string): Promise<ParametrosFiscaisExtraidos | null> {
    try {
      const resp = await fetch(`${this.config.baseUrl}/v1/parametros-fiscais/${medicoId}`, {
        headers: {
          'X-Internal-Token': this.config.tokenInterno
        }
      });
      if (!resp.ok) return null;
      const body = await resp.json() as { sucesso: boolean; parametros: ParametrosFiscaisExtraidos };
      return body.sucesso ? body.parametros : null;
    } catch {
      return null;
    }
  }

  async obterDanfsePdf(pedidoId: string): Promise<Buffer | null> {
    try {
      const resp = await fetch(`${this.config.baseUrl}/v1/notas/${pedidoId}/pdf`, {
        headers: {
          'X-Internal-Token': this.config.tokenInterno
        }
      });
      if (!resp.ok) return null;
      const arrayBuffer = await resp.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
  }
}
