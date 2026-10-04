/**
 * Tipos e opções de dados para a geração do DANFSe v2.0 em PDF.
 * Define o contrato independente de fonte de dados (banco, SEFIN ou simulação),
 * cobrindo integralmente as especificações da NT 008/2026 e RTC 2026 (IBS/CBS).
 */

export interface DanfsePrestador {
  razaoSocial?: string;
  nomeFantasia?: string;
  cnpj?: string;
  inscricaoMunicipal?: string;
  endereco?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  email?: string;
  simplesNacional?: boolean;
}

export interface DanfseTomador {
  nome?: string;
  cpf?: string;
  inscricaoMunicipal?: string;
  endereco?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
  telefone?: string;
  email?: string;
}

export interface DanfseServico {
  municipioPrestacao?: string;
  ufPrestacao?: string;
  tipoTributacao?: string;
  tipoRetencao?: string;
  cTribNac?: string;
  cNBS?: string;
  discriminacao?: string;
  valor?: number;
  aliquota?: number;
  issApurado?: number;
  desconto?: number;
  retencoes?: number;
  deducoes?: number;
  cstIbsCbs?: string;
  cClassTrib?: string;
  cIndOp?: string;
  aliquotaCbs?: number;
  valorCbs?: number;
  aliquotaIbs?: number;
  valorIbs?: number;
}

export interface DanfsePdfOptions {
  chaveAcesso?: string;
  numero?: string;
  serie?: string;
  dataEmissao?: string;
  competencia?: string;
  codigoVerificacao?: string;
  ambiente?: 'producao' | 'homologacao';
  cancelada?: boolean;
  prestador?: DanfsePrestador;
  tomador?: DanfseTomador;
  servico?: DanfseServico;
}
