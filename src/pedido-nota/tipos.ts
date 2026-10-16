/**
 * Tipos e contratos do fluxo de pedidos de emissão de NFS-e solicitados diretamente
 * pelo médico via Noto Assistente (ex: "emite a nota do Antônio Marques").
 * Isola estruturas de dados sem carregar dependências externas de I/O ou banco.
 */

export type StatusPedidoNota =
  | 'aguardando_confirmacao'
  | 'aguardando_dados_faltantes'
  | 'aguardando_escolha_paciente'
  | 'aprovado'
  | 'cancelado'
  | 'erro_emissao'
  | 'emitido'
  | 'expirado';

export type OrigemDadosPaciente = 'supabase' | 'sheets' | 'conversa' | 'manual';

export interface PacienteEncontrado {
  pacienteId?: string;
  nome: string;
  cpfLimpo?: string | null;
  telefone?: string | null;
  origem: OrigemDadosPaciente;
  detalheOrigem?: string;
  dataConsultaSugerida?: string | null;
  valorSugeridoCentavos?: number | null;
}

export interface DadosExtraidosPedido {
  ehPedidoNota: boolean;
  nomePaciente?: string | null;
  cpfLimpo?: string | null;
  telefone?: string | null;
  dataConsultaTexto?: string | null;
  valorCentavos?: number | null;
  confianca?: number;
}

export interface PedidoNota {
  id: string;
  medicoId: string;
  mensagemId: string;
  status: StatusPedidoNota;
  pacienteId?: string | null;
  nomePaciente?: string | null;
  cpfLimpo?: string | null;
  telefonePaciente?: string | null;
  dataConsulta?: string | null;
  valorCentavos?: number | null;
  origemDados?: OrigemDadosPaciente | null;
  dadosBrutos?: Record<string, unknown> | null;
  candidatosMultiplos?: PacienteEncontrado[] | null;
  solicitacaoId?: string | null;
  referenciaExterna: string;
  expiraEm: Date;
  criadoEm: Date;
  atualizadoEm: Date;
}

export interface CriarPedidoNotaParams {
  medicoId: string;
  mensagemId: string;
  status: StatusPedidoNota;
  referenciaExterna: string;
  pacienteId?: string | null;
  nomePaciente?: string | null;
  cpfLimpo?: string | null;
  telefonePaciente?: string | null;
  dataConsulta?: string | null;
  valorCentavos?: number | null;
  origemDados?: OrigemDadosPaciente | null;
  dadosBrutos?: Record<string, unknown> | null;
  candidatosMultiplos?: PacienteEncontrado[] | null;
}

export interface TermoBuscaPaciente {
  nome?: string | null;
  telefone?: string | null;
  cpf?: string | null;
}
