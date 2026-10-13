/**
 * Caso de uso: Receber solicitação de emissão via API REST com garantia de idempotência (?ref=...).
 * Orquestra validação sintática, consulta de duplicidade, inferência fiscal Zero-Config
 * e enfileiramento assíncrono para o worker, sem expor detalhes contábeis para o chamador.
 */

import { validarPayloadEmissao } from './validar-payload-emissao.js';
import { montarDescricaoServico } from '../../emissao/montar-descricao-servico.js';
import type {
  EmissaoApiRepositorio,
  SolicitacaoRefRegistro,
  PerfilFiscalMedicoRegistro
} from './emissao-api-repositorio.js';
import type { RespostaEmissaoApi, ErroDetalhadoApi } from './nfse-api-types.js';

export interface ProcessarEmissaoApiDeps {
  repositorio: EmissaoApiRepositorio;
  agora?: () => Date;
}

export type ResultadoProcessarEmissaoApi =
  | { ok: true; statusHttp: 200 | 201 | 202; resposta: RespostaEmissaoApi }
  | { ok: false; statusHttp: 400 | 422; erro: ErroDetalhadoApi };

export async function processarSolicitacaoEmissaoApi(
  payloadBruto: unknown,
  deps: ProcessarEmissaoApiDeps
): Promise<ResultadoProcessarEmissaoApi> {
  const validacao = validarPayloadEmissao(payloadBruto);
  if (!validacao.ok) {
    return { ok: false, statusHttp: 400, erro: validacao.erro };
  }

  const { dados } = validacao;
  const existente = await deps.repositorio.buscarPorReferencia(dados.medicoId, dados.ref);
  if (existente) {
    return resolverSolicitacaoExistente(existente);
  }

  const perfil = await deps.repositorio.buscarPerfilFiscalMedico(dados.medicoId);
  if (!perfil || !perfil.configuracaoCompleta) {
    return {
      ok: false,
      statusHttp: 422,
      erro: {
        codigo: 'perfil_fiscal_incompleto',
        mensagem: 'O perfil fiscal do médico prestador ainda não está configurado ou aprovado',
        correcao: 'Conclua o onboarding fiscal do médico antes de emitir notas'
      }
    };
  }

  const paciente = await deps.repositorio.buscarOuCriarPaciente(dados.medicoId, dados.paciente);
  const dataAtual = deps.agora ? deps.agora() : new Date();
  const xdescServ = resolverDescricaoServico(dados.discriminacao, perfil, dados.datasConsultas, dataAtual);

  const insercao = await deps.repositorio.enfileirarSolicitacao({
    ref: dados.ref,
    medicoId: dados.medicoId,
    pacienteId: paciente.id,
    valorServicoCentavos: dados.valorCentavos,
    xdescServ,
    ctribNac: perfil.ctribNacPadrao,
    cnbs: perfil.cnbs,
    cclassTrib: perfil.cclassTrib,
    cindOp: perfil.cindOp,
    datasConsultaTexto: dados.datasConsultas
  });

  return {
    ok: true,
    statusHttp: 201,
    resposta: {
      status: 'processando_autorizacao',
      ref: dados.ref,
      solicitacaoId: insercao.id,
      mensagem: 'Solicitação aceita para processamento'
    }
  };
}

function resolverSolicitacaoExistente(existente: SolicitacaoRefRegistro): ResultadoProcessarEmissaoApi {
  if (existente.notaFiscal) {
    return {
      ok: true,
      statusHttp: 200,
      resposta: {
        status: 'autorizado',
        ref: existente.referenciaExterna,
        solicitacaoId: existente.id,
        chaveAcesso: existente.notaFiscal.chaveAcesso,
        ndps: existente.notaFiscal.ndps,
        serie: existente.notaFiscal.serie,
        dataEmissao: existente.notaFiscal.dataEmissao.toISOString(),
        xmlStoragePath: existente.notaFiscal.xmlStoragePath,
        pdfStoragePath: existente.notaFiscal.pdfStoragePath
      }
    };
  }

  if (existente.status === 'erro' || existente.status === 'excecao') {
    return {
      ok: false,
      statusHttp: 422,
      erro: {
        codigo: 'solicitacao_anterior_falhou',
        mensagem: existente.erro || 'A solicitação anterior enviada com esta referência falhou',
        correcao: 'Consulte os detalhes da falha ou gere uma nova referência exclusiva para nova tentativa'
      }
    };
  }

  return {
    ok: true,
    statusHttp: 200,
    resposta: {
      status: 'processando_autorizacao',
      ref: existente.referenciaExterna,
      solicitacaoId: existente.id,
      mensagem: 'Solicitação já recebida previamente e em fila de processamento'
    }
  };
}

function resolverDescricaoServico(
  discriminacaoFornecida: string | null | undefined,
  perfil: PerfilFiscalMedicoRegistro,
  datasConsultas: string | null | undefined,
  dataAtual: Date
): string {
  if (discriminacaoFornecida && discriminacaoFornecida.trim().length > 0) {
    return discriminacaoFornecida.trim();
  }

  const datas = datasConsultas && datasConsultas.trim().length > 0
    ? datasConsultas.trim()
    : [dataAtual];

  return montarDescricaoServico(
    {
      nomeCompleto: perfil.nomeCompleto,
      especialidade: perfil.especialidade,
      crm: perfil.crm,
      rqe: perfil.rqe
    },
    datas
  );
}
