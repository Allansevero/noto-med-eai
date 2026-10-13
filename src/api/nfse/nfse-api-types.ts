/**
 * Tipos e contratos de dados para a API pública de emissão de NFS-e (padrão Focus NFe + Zero-Config).
 * Define a estrutura das requisições e respostas de status, garantindo tipagem estrita
 * entre a camada HTTP e os casos de uso.
 */

export interface DadosPacienteApi {
  cpf: string;
  nome: string;
  email?: string | null;
  telefone?: string | null;
}

export interface SolicitacaoEmissaoApiPayload {
  ref: string;
  medicoId: string;
  valor: number;
  paciente: DadosPacienteApi;
  discriminacao?: string | null;
  datasConsultas?: string | null;
}

export interface SolicitacaoEmissaoValidada {
  ref: string;
  medicoId: string;
  valorCentavos: number;
  paciente: {
    cpfLimpo: string;
    nome: string;
    email?: string | null;
    telefone?: string | null;
  };
  discriminacao?: string | null;
  datasConsultas?: string | null;
}

export interface ErroDetalhadoApi {
  codigo: string;
  mensagem: string;
  correcao?: string;
  campo?: string;
}

export type RespostaEmissaoApi =
  | {
      status: 'processando_autorizacao';
      ref: string;
      solicitacaoId: string;
      mensagem: string;
    }
  | {
      status: 'autorizado';
      ref: string;
      solicitacaoId: string;
      chaveAcesso: string;
      ndps: number;
      serie: string;
      dataEmissao: string;
      xmlStoragePath?: string | null;
      pdfStoragePath?: string | null;
    }
  | {
      status: 'cancelado';
      ref: string;
      solicitacaoId: string;
      mensagem?: string;
    }
  | {
      status: 'erro_autorizacao';
      ref: string;
      solicitacaoId: string;
      erros: ErroDetalhadoApi[];
    };
