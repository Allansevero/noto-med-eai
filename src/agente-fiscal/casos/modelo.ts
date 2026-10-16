import type { CandidatoNotaFiscal } from '../regras/correlacionar-consulta-pagamento.js';

export type EstadoCasoFiscal = 'em_revisao' | 'aguardando_dados' | 'aguardando_aprovacao'
  | 'adiado' | 'recusado' | 'enfileirado' | 'emitido' | 'falhou';

export interface PerguntaPendente {
  campo: string;
  mensagemId: string | null;
  enviadaEm?: string;
  texto?: string;
}

export interface CasoFiscal {
  id: string;
  medicoId: string;
  mensagemPagamentoId: string;
  candidato: CandidatoNotaFiscal;
  estado: EstadoCasoFiscal;
  revisao: number;
  solicitacaoId: string | null;
  perguntaPendente: PerguntaPendente | null;
  dados: Record<string, unknown>;
  adiadoAte: Date | null;
  criadoEm: Date;
  atualizadoEm: Date;
}

export type AtualizacaoCasoFiscal = Partial<Pick<CasoFiscal,
  'candidato' | 'estado' | 'solicitacaoId' | 'perguntaPendente' | 'dados' | 'adiadoAte'>>;

export interface NovoEventoAgente {
  medicoId: string;
  instanciaNome: string;
  mensagemId: string;
  tipo?: 'entrada' | 'saida';
  payload: Record<string, unknown>;
}

export interface EventoAgente extends NovoEventoAgente {
  id: string;
  tipo: 'entrada' | 'saida';
  tentativas: number;
  tokenLease: string;
}
