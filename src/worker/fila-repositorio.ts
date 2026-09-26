/**
 * Porta de persistência para o worker da fila de emissão de NFS-e.
 * Gerencia o lock otimista (bloqueada_por_worker), consumo de solicitações
 * prontas e gravação atômica da nota autorizada ou agendamento de retentativa.
 */

import type { SolicitacaoEmissaoItem } from './emissor-dps-service.js';

export interface ItemFilaComTentativas extends SolicitacaoEmissaoItem {
  tentativas: number;
}

export interface RegistrarSucessoEmissaoParams {
  solicitacaoId: string;
  medicoId: string;
  chaveAcesso: string;
  ndps: number;
  serie: string;
  competencia: string;
  dataEmissao: Date;
  valorServicosCentavos: number;
  xmlStoragePath: string;
  pdfStoragePath: string;
  respostaSefinRaw?: Record<string, unknown>;
}

export interface ContextoEnvioNota {
  instanciaNome: string;
  contatoTelefone: string;
  telefoneMedico: string;
  nomePaciente: string | null;
}

export interface FilaRepositorio {
  buscarETravarProximoItem(workerId: string): Promise<ItemFilaComTentativas | null>;
  buscarContextoEnvio(solicitacaoId: string): Promise<ContextoEnvioNota | null>;
  registrarSucesso(params: RegistrarSucessoEmissaoParams): Promise<void>;
  reagendarTentativa(params: {
    solicitacaoId: string;
    tentativas: number;
    proximaTentativaEm: Date;
    erro: string;
  }): Promise<void>;
  marcarFalhaDefinitiva(params: {
    solicitacaoId: string;
    tentativas: number;
    erro: string;
  }): Promise<void>;
}
