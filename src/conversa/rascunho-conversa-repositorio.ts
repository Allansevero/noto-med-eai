/**
 * Porta de persistência para o rascunho da conversa.
 * Permite que dados coletados durante o fluxo de onboarding e mensagens pendentes
 * sobrevivam a reinícios do servidor sem perda de estado.
 */

export interface DadosRascunhoOnboarding {
  interlocutor: 'medica' | 'secretaria' | 'desconhecido';
  secretariaId?: string;
  secretariaNome?: string;
  medicoId?: string;
  nomeMedica?: string;
  crm?: string;
  ufCrm?: string;
  rqe?: string | null;
  especialidade?: string | null;
  etapaAtual: string;
  janelaDataCorte?: string;
  preferenciaData?: string;
  respostasNaoEnviadas?: string[];
  identidadeMedicaConfirmada: boolean;
  statusCadastro: 'pendente' | 'em_analise' | 'confirmado';
}

export interface RascunhoConversaRegistro {
  id: string;
  conversaId: string;
  instanciaNome: string;
  contatoTelefone: string;
  dados: DadosRascunhoOnboarding;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface RascunhoConversaRepositorio {
  buscarPorContato(conversaId: string): Promise<RascunhoConversaRegistro | null>;
  salvar(conversaId: string, instanciaNome: string, contatoTelefone: string, dados: DadosRascunhoOnboarding): Promise<RascunhoConversaRegistro>;
  remover(conversaId: string): Promise<void>;
}
