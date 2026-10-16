/**
 * Contratos de tipos de dados (DTOs) para comunicação com o serviço /fiscal.
 * Define formatos de entrada e saída para processamento de certificado A1,
 * consulta de parâmetros e emissão idempotente de NFS-e Nacional.
 */

import type { CodigoErroFiscal } from './codigos-erro.js';

export type TipoPessoaFiscal = 'PF' | 'PJ';

export interface TitularCertificadoA1 {
  nome: string;
  tipo: TipoPessoaFiscal;
  cnpj?: string;
  cpf?: string;
  validadeAte: string;
}

export interface ReformaTributariaIbsCbs {
  cbsAliquota: number;
  ibsAliquota: number;
}

export interface ParametrosFiscaisExtraidos {
  regimeTributario: string;
  optanteSimples: boolean;
  aliquotaIss: number;
  codigoTributacaoNacional: string;
  descricaoServicoPadrao: string;
  reformaTributaria: ReformaTributariaIbsCbs;
}

export interface RequisicaoSalvarCertificado {
  medicoId: string;
  arquivoBase64: string;
  senha: string;
  nomeArquivo?: string;
}

export interface RespostaSalvarCertificadoSucesso {
  sucesso: true;
  titular: TitularCertificadoA1;
  parametrosFiscaisSugeridos: ParametrosFiscaisExtraidos;
  referenciaAdnEncontrada: boolean;
}

export interface RespostaSalvarCertificadoFalha {
  sucesso: false;
  codigo: CodigoErroFiscal;
  mensagem: string;
}

export type RespostaSalvarCertificado =
  | RespostaSalvarCertificadoSucesso
  | RespostaSalvarCertificadoFalha;

export interface TomadorNotaFiscal {
  cpfCnpj: string;
  nome: string;
  telefone?: string;
  email?: string;
}

export interface DadosServicoEmissao {
  valorCentavos: number;
  dataCompetencia: string;
  discriminacao: string;
}

export interface RequisicaoEmitirNota {
  pedidoId: string;
  medicoId: string;
  tomador: TomadorNotaFiscal;
  servico: DadosServicoEmissao;
  parametrosSobrescritos?: Partial<ParametrosFiscaisExtraidos>;
}

export type StatusEmissaoFiscal = 'autorizada' | 'processando' | 'rejeitada';

export interface RespostaEmitirNotaSucesso {
  sucesso: true;
  pedidoId: string;
  status: StatusEmissaoFiscal;
  chaveAcesso?: string;
  numeroNota?: string;
  serie?: string;
  dataEmissao?: string;
  linkDanfsePdf?: string;
}

export interface RespostaEmitirNotaFalha {
  sucesso: false;
  pedidoId: string;
  status: 'rejeitada';
  codigo: CodigoErroFiscal;
  mensagem: string;
  codigoSefin?: string;
}

export type RespostaEmitirNota =
  | RespostaEmitirNotaSucesso
  | RespostaEmitirNotaFalha;
