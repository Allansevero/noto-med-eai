/**
 * Contratos de dados e tipos centrais para o pipeline de detecção de comprovantes,
 * validação com visão computacional (Gemini) e aprovação de emissão de NFS-e pelo médico.
 * Mantido separado das regras e I/O para evitar dependências circulares.
 */

export type TipoPagamentoComprovante = 'pix' | 'ted' | 'transferencia' | 'cartao' | 'boleto' | 'outro';

export type StatusCandidatoEmissao =
  | 'pendente_aprovacao'
  | 'aprovado'
  | 'recusado'
  | 'ja_faturado'
  | 'erro_emissao'
  | 'emitido';

export interface DadosComprovanteExtraidos {
  ehComprovante: boolean;
  ehNotaFiscal?: boolean;
  tipo?: TipoPagamentoComprovante;
  valorCentavos?: number;
  valorFormatado?: string;
  dataPagamento?: string; // Formato YYYY-MM-DD
  idTransacao?: string; // txid, identificador fim-a-fim ou autenticação
  pagadorNome?: string;
  favorecidoNome?: string;
  confianca?: number;
}

export interface CandidatoEmissao {
  id: string;
  medicoId: string;
  pacienteId?: string | null;
  mensagemId: string;
  conversaId: string;
  telefonePaciente: string;
  nomePaciente?: string | null;
  valorCentavos: number;
  dataPagamento?: string | null;
  idTransacao?: string | null;
  tipoPagamento?: TipoPagamentoComprovante | string | null;
  status: StatusCandidatoEmissao;
  referenciaExterna: string;
  solicitacaoId?: string | null;
  notificadoEm?: Date | null;
  respondidoEm?: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface CriarCandidatoParams {
  medicoId: string;
  pacienteId?: string | null;
  mensagemId: string;
  conversaId: string;
  telefonePaciente: string;
  nomePaciente?: string | null;
  valorCentavos: number;
  dataPagamento?: string | null;
  idTransacao?: string | null;
  tipoPagamento?: string | null;
  dadosBrutos?: unknown;
  referenciaExterna: string;
}

export type DecisaoMedico =
  | { acao: 'aprovar'; valorAjustadoCentavos?: number }
  | { acao: 'recusar' }
  | { acao: 'fornecer_cpf'; cpf: string }
  | { acao: 'pedir_cpf_paciente' }
  | { acao: 'ignorar' };
