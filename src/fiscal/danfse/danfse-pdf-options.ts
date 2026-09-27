/**
 * Tipos e opções de dados para a geração do DANFSe v2.0 em PDF.
 * Define o contrato independente de fonte de dados (banco, SEFIN ou simulação),
 * permitindo gerar o PDF oficial em qualquer camada sem acoplamento a I/O.
 */

export interface DanfsePrestador {
  razaoSocial?: string;
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
  cTribNac?: string;
  cNBS?: string;
  discriminacao?: string;
  valor?: number;
  aliquota?: number;
  issApurado?: number;
  desconto?: number;
  retencoes?: number;
  deducoes?: number;
}

export interface DanfsePdfOptions {
  chaveAcesso?: string;
  numero?: string;
  serie?: string;
  dataEmissao?: string;
  competencia?: string;
  ambiente?: 'producao' | 'homologacao';
  cancelada?: boolean;
  prestador?: DanfsePrestador;
  tomador?: DanfseTomador;
  servico?: DanfseServico;
}
