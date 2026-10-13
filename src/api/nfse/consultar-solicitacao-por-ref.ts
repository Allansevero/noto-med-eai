/**
 * Caso de uso: Consulta de NFS-e por referência externa do parceiro.
 * Mapeia o estado interno do ciclo de vida assíncrono (fila/autorizada/erro)
 * para os estados padronizados da Focus NFe (processando_autorizacao, autorizado, erro_autorizacao).
 */

import type { EmissaoApiRepositorio, SolicitacaoRefRegistro } from './emissao-api-repositorio.js';
import type { RespostaEmissaoApi, ErroDetalhadoApi } from './nfse-api-types.js';

export interface ParametrosConsultaRef {
  medicoId: string;
  ref: string;
}

export type ResultadoConsultaRef =
  | { ok: true; statusHttp: 200; dados: RespostaEmissaoApi }
  | { ok: false; statusHttp: 400 | 401 | 404; erro: ErroDetalhadoApi };

export async function consultarSolicitacaoPorRef(
  params: ParametrosConsultaRef,
  repositorio: EmissaoApiRepositorio
): Promise<ResultadoConsultaRef> {
  if (!params.ref || typeof params.ref !== 'string' || params.ref.trim().length === 0) {
    return {
      ok: false,
      statusHttp: 400,
      erro: { codigo: 'parametro_invalido', mensagem: 'O parâmetro ref é obrigatório' }
    };
  }

  if (!params.medicoId) {
    return {
      ok: false,
      statusHttp: 401,
      erro: { codigo: 'nao_autorizado', mensagem: 'Médico não autenticado' }
    };
  }

  const refLimpa = params.ref.trim();
  const registro = await repositorio.buscarPorReferencia(params.medicoId, refLimpa);

  if (!registro) {
    return {
      ok: false,
      statusHttp: 404,
      erro: { codigo: 'nao_encontrado', mensagem: `NFS-e não encontrada para a referência: ${refLimpa}` }
    };
  }

  return {
    ok: true,
    statusHttp: 200,
    dados: mapearRegistroParaResposta(registro)
  };
}

function mapearRegistroParaResposta(reg: SolicitacaoRefRegistro): RespostaEmissaoApi {
  if (reg.notaFiscal) {
    return {
      status: 'autorizado',
      ref: reg.referenciaExterna,
      solicitacaoId: reg.id,
      chaveAcesso: reg.notaFiscal.chaveAcesso,
      ndps: reg.notaFiscal.ndps,
      serie: reg.notaFiscal.serie,
      dataEmissao: reg.notaFiscal.dataEmissao.toISOString(),
      xmlStoragePath: reg.notaFiscal.xmlStoragePath ?? null,
      pdfStoragePath: reg.notaFiscal.pdfStoragePath ?? null
    };
  }

  if (reg.status === 'erro' || reg.status === 'excecao') {
    return {
      status: 'erro_autorizacao',
      ref: reg.referenciaExterna,
      solicitacaoId: reg.id,
      erros: [
        {
          codigo: 'erro_autorizacao_sefin',
          mensagem: reg.erro || 'Falha na autorização da DPS junto ao SEFIN Nacional'
        }
      ]
    };
  }

  return {
    status: 'processando_autorizacao',
    ref: reg.referenciaExterna,
    solicitacaoId: reg.id,
    mensagem: 'Solicitação em processamento na fila de autorização'
  };
}
