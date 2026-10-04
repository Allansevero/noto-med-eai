/**
 * Contratos estreitos da investigação: o modelo recebe contexto selecionado e
 * propõe ações; não recebe SQL, credenciais ou acesso ao emissor.
 */
import type { ResultadoEmissaoDps } from '../worker/emissor-dps-service.js';
import type { ItemFilaComTentativas } from '../worker/fila-repositorio.js';

export type FalhaEmissao = Extract<ResultadoEmissaoDps, { sucesso: false }>;
export type EstadoInvestigacao = 'investigando' | 'tentando_resolver' | 'resolvido' | 'necessita_intervencao';
export interface ContextoInvestigacao {
  status: string;
  tentativas: number;
  autorizada: boolean;
  perfil: Record<string, unknown> | null;
  historico: unknown[];
}
export interface DecisaoInvestigacao {
  acao: 'tentar_novamente' | 'corrigir_tributos_federais' | 'escalar';
  causa: string;
  justificativa: string;
  acaoNecessaria: string;
}
export interface DecisorFiscal {
  decidir(contexto: Record<string, unknown>): Promise<DecisaoInvestigacao>;
}
export interface InvestigacaoRepositorio {
  assumir(item: ItemFilaComTentativas, falha: FalhaEmissao): Promise<boolean>;
  consultar(item: ItemFilaComTentativas): Promise<ContextoInvestigacao>;
  registrar(item: ItemFilaComTentativas, evento: Record<string, unknown>, estado?: EstadoInvestigacao): Promise<void>;
  reservarTentativa(item: ItemFilaComTentativas, acao?: 'tentar_novamente' | 'corrigir_tributos_federais'): Promise<boolean>;
}
export function permiteRetentativa(falha: FalhaEmissao, contexto: ContextoInvestigacao): boolean {
  return !contexto.autorizada && contexto.tentativas < 3 &&
    !falha.codigoErroSefin &&
    (falha.falhaAntesDoEnvio === 'EAI_AGAIN' || falha.falhaAntesDoEnvio === 'ECONNREFUSED');
}
