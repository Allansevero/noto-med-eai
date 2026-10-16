/**
 * Contratos de tipos de dados (DTOs) para comunicação com o serviço /ia.
 * Define formatos de entrada e saída para detecção autônoma de candidatos
 * a emissão, inferência de datas e autocorreção de notas fiscais rejeitadas.
 */

import type { CodigoErroIa } from './codigos-erro.js';

export interface MensagemEntradaIa {
  id: string;
  direcao: 'enviada' | 'recebida';
  tipo: 'texto' | 'imagem' | 'documento' | 'outro';
  conteudo?: string;
  midiaBase64?: string;
  mimetype?: string;
  timestamp: string;
}

export interface ConversaEntradaIa {
  conversaId: string;
  contatoTelefone: string;
  contatoNome?: string;
  pacienteNomeCadastrado?: string;
  mensagens: MensagemEntradaIa[];
}

export interface DadosMedicoIa {
  nome: string;
  cpfCnpj: string;
  valorPadraoCentavos?: number;
}

export interface RequisicaoDetectarCandidatos {
  medicoId: string;
  dadosMedico: DadosMedicoIa;
  conversa: ConversaEntradaIa;
}

export interface DadosExtraidosComprovante {
  valorCentavos: number;
  dataPagamento: string;
  dataConsultaSugerida: string;
  origemDataConsulta: 'descricao_pix' | 'mensagem_agendamento' | 'data_pagamento';
  pagadorNome?: string;
  pagadorCpf?: string;
  banco?: string;
}

export interface RespostaDetectarCandidatosSucesso {
  sucesso: true;
  candidatoDetectado: boolean;
  confianca?: number;
  dadosExtraidos?: DadosExtraidosComprovante;
  perguntaSugeridaMedico?: string;
  dadosFaltantes: string[];
  perguntaDadosFaltantes?: string | null;
}

export interface RespostaDetectarCandidatosFalha {
  sucesso: false;
  codigo: CodigoErroIa;
  mensagem: string;
}

export type RespostaDetectarCandidatos =
  | RespostaDetectarCandidatosSucesso
  | RespostaDetectarCandidatosFalha;

export interface ErroSefinEntrada {
  codigo?: string;
  mensagem: string;
}

export interface RequisicaoAutocorrigirFalha {
  medicoId: string;
  pedidoId: string;
  erroSefin: ErroSefinEntrada;
  dadosNota: Record<string, unknown>;
  parametrosAtuais: Record<string, unknown>;
}

export interface AcaoRecomendadaAutocorrecao {
  tipo: 'atualizar_parametro_fiscal_e_reemitir' | 'solicitar_ajuste_manual_medico';
  alteracoesParametros?: Record<string, unknown>;
}

export interface RespostaAutocorrigirFalhaSucesso {
  sucesso: true;
  diagnostico: string;
  podeCorrigirAutonomamente: boolean;
  acaoRecomendada: AcaoRecomendadaAutocorrecao;
  explicacaoTecnica: string;
}

export interface RespostaAutocorrigirFalhaFalha {
  sucesso: false;
  codigo: CodigoErroIa;
  mensagem: string;
}

export type RespostaAutocorrigirFalha =
  | RespostaAutocorrigirFalhaSucesso
  | RespostaAutocorrigirFalhaFalha;
