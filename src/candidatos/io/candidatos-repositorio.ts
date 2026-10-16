/**
 * Porta de persistência para candidatos a emissão de notas fiscais.
 * Isola todas as consultas e mutações ao banco de dados, permitindo que os fluxos
 * sejam testados com implementações em memória sem conexões reais de rede.
 */

import type {
  CandidatoEmissao,
  CriarCandidatoParams,
  StatusCandidatoEmissao
} from '../tipos.js';

export interface PacienteDadosBasicos {
  id: string;
  nome: string | null;
  cpfLimpo: string | null;
  telefone: string;
}

export interface MedicoDadosBasicos {
  id: string;
  nomeCompleto: string;
  telefone: string | null;
}

export interface MensagemConversaRegistro {
  id: string;
  direcao: 'enviada' | 'recebida';
  tipo: 'texto' | 'imagem' | 'documento' | 'outro';
  conteudo?: string | null;
  criadoEm: Date;
  payloadBruto?: Record<string, unknown> | null;
}

export interface CandidatosRepositorio {
  salvarCandidato(params: CriarCandidatoParams): Promise<CandidatoEmissao>;
  buscarCandidatoPorMensagem(medicoId: string, mensagemId: string): Promise<CandidatoEmissao | null>;
  buscarCandidatoPorTxid(medicoId: string, txid: string): Promise<CandidatoEmissao | null>;
  buscarUltimoAguardandoAprovacao(medicoId: string): Promise<CandidatoEmissao | null>;
  atualizarStatus(
    id: string,
    status: StatusCandidatoEmissao,
    extra?: { solicitacaoId?: string; valorCentavos?: number }
  ): Promise<void>;
  marcarNotificado(id: string): Promise<void>;
  buscarPacientePorTelefone(medicoId: string, telefone: string): Promise<PacienteDadosBasicos | null>;
  salvarCpfPaciente(medicoId: string, pacienteId: string, cpfLimpo: string): Promise<void>;
  buscarMensagensConversa?(conversaId: string): Promise<MensagemConversaRegistro[]>;
  jaExisteFaturamento(
    medicoId: string,
    params: {
      txid?: string | null;
      referenciaExterna: string;
      telefonePaciente: string;
      valorCentavos: number;
    }
  ): Promise<boolean>;
  obterDadosMedico(medicoId: string): Promise<MedicoDadosBasicos | null>;
}

