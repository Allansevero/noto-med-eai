/**
 * Porta de persistência para o fluxo de atendimento por WhatsApp.
 * Isola as tabelas de conversas, agendamentos, pacientes e solicitações
 * de nota fiscal das regras de orquestração do webhook.
 */

import type { RespostaRapidaModelo } from '../whatsapp/casar-resposta-rapida.js';

export interface InstanciaRegistro {
  id: string;
  medicoId: string | null;
  nomeInstancia: string;
  oficial: boolean;
}

export interface ConversaRegistro {
  id: string;
  instanciaId: string;
  medicoId: string | null;
  contatoTelefone: string;
  pacienteId: string | null;
  aguardandoCpfDesde: Date | null;
}

export interface PacienteRegistro {
  id: string;
  medicoId: string;
  telefone: string;
  nome: string | null;
  cpfHash: string | null;
  email?: string | null;
  dataNascimento?: Date | null;
}

export interface MedicoDadosRegistro {
  id: string;
  nomeCompleto: string;
  especialidade: string | null;
  crm: string | null;
  rqe: string | null;
  ctribNacPadrao: string;
  telefone?: string;
}

export interface ConsultaEmAbertoRegistro {
  id: string;
  dataHora: Date;
  valorConsultaCentavos: number | null;
}

export interface SolicitacaoAguardandoDataRegistro {
  id: string;
  medicoId: string;
  pacienteId: string;
  nomePaciente: string;
  telefoneMedico: string;
  valorServicoCentavos: number;
  ctribNac: string;
  criadoEm: Date;
}

export interface AtendimentoRepositorio {
  buscarInstanciaPorNome(nomeInstancia: string): Promise<InstanciaRegistro | null>;
  buscarOuCriarConversa(instanciaId: string, medicoId: string | null, contatoTelefone: string): Promise<ConversaRegistro>;
  buscarRespostasRapidasMedico(medicoId: string): Promise<RespostaRapidaModelo[]>;
  buscarPacientePorId(pacienteId: string): Promise<PacienteRegistro | null>;
  buscarPacientePorTelefone(medicoId: string, telefone: string): Promise<PacienteRegistro | null>;
  criarPacienteMinimo(params: {
    medicoId: string;
    telefone: string;
    nome?: string | null;
    email?: string | null;
    cpfHash?: string | null;
    cpf?: string | null;
    origemCadastro?: string;
  }): Promise<PacienteRegistro>;

  atualizarCpfPaciente(params: {
    pacienteId: string;
    cpfHash: string;
    cpf?: string | null;
    nome?: string | null;
    dataNascimento?: Date | null;
  }): Promise<void>;

  vincularPacienteConversa(conversaId: string, pacienteId: string): Promise<void>;
  marcarAguardandoCpf(conversaId: string, aguardandoDesde: Date | null): Promise<void>;
  criarAgendamento(params: {
    medicoId: string;
    pacienteId: string;
    conversaId: string;
    dataHora: Date;
    valorConsultaCentavos?: number | null;
  }): Promise<{ id: string }>;
  buscarConsultasEmAberto(medicoId: string, pacienteId: string): Promise<ConsultaEmAbertoRegistro[]>;
  buscarDadosMedico(medicoId: string): Promise<MedicoDadosRegistro | null>;
  buscarMedicoPorTelefone(telefone: string): Promise<MedicoDadosRegistro | null>;
  criarSolicitacaoNota(params: {
    medicoId: string;
    pacienteId: string;
    xdescServ: string;
    valorServicoCentavos: number;
    ctribNac: string;
    fila: 'pronta' | 'pendente_cadastro' | null;
    aguardandoDataConsulta?: boolean;
    agendamentoIds: string[];
  }): Promise<{ id: string }>;
  buscarSolicitacaoAguardandoData(medicoId: string, pacienteId?: string): Promise<SolicitacaoAguardandoDataRegistro | null>;
  atualizarDataDescricaoSolicitacao(params: {
    solicitacaoId: string;
    xdescServ: string;
    fila: 'pronta' | 'pendente_cadastro';
  }): Promise<void>;
  liberarSolicitacoesPendentesCpf(medicoId: string, pacienteId: string): Promise<number>;
}
