/**
 * Regra pura de validação de limites de emissão de notas fiscais.
 * Não realiza I/O nem lê variáveis de ambiente — recebe os dados consolidados de
 * uso e do plano e decide se o médico pode emitir uma nova NFS-e (seção 2 do plano).
 */

import {
  LIMITE_NOTAS_DIA_GRATUITO,
  LIMITE_NOTAS_MES_MENSAL,
  MENSAGENS_BLOQUEIO_LIMITE
} from './billing-config.js';

export interface DadosUsoPlano {
  planoNome: string;
  limiteNotasDia?: number | null;
  limiteNotasMes?: number | null;
  notasHoje: number;
  notasMes: number;
  travaEmissao: boolean;
  assinaturaStatus: string;
  checkoutUrl?: string;
  portalUrl?: string;
}

export type ResultadoVerificarLimite =
  | { permitido: true }
  | {
      permitido: false;
      motivo:
        | 'limite_diario_atingido'
        | 'limite_mensal_atingido'
        | 'assinatura_inadimplente'
        | 'emissao_travada';
      mensagem: string;
    };

export function verificarLimiteEmissao(dados: DadosUsoPlano): ResultadoVerificarLimite {
  if (dados.travaEmissao) {
    return {
      permitido: false,
      motivo: 'emissao_travada',
      mensagem: MENSAGENS_BLOQUEIO_LIMITE.TRAVA_MANUAL
    };
  }

  if (dados.assinaturaStatus === 'inadimplente' || dados.assinaturaStatus === 'suspensa') {
    return {
      permitido: false,
      motivo: 'assinatura_inadimplente',
      mensagem: MENSAGENS_BLOQUEIO_LIMITE.INADIMPLENTE
    };
  }

  const isMensal = dados.planoNome.toLowerCase() === 'mensal' && dados.assinaturaStatus === 'ativa';

  if (isMensal) {
    const maxMes = dados.limiteNotasMes ?? LIMITE_NOTAS_MES_MENSAL;
    if (dados.notasMes >= maxMes) {
      return {
        permitido: false,
        motivo: 'limite_mensal_atingido',
        mensagem: MENSAGENS_BLOQUEIO_LIMITE.LIMITE_MENSAL_ATINGIDO(dados.notasMes, maxMes, dados.portalUrl)
      };
    }
    return { permitido: true };
  }

  // Plano Gratuito / Trial / Fallback
  const maxDia = dados.limiteNotasDia ?? LIMITE_NOTAS_DIA_GRATUITO;
  if (dados.notasHoje >= maxDia) {
    return {
      permitido: false,
      motivo: 'limite_diario_atingido',
      mensagem: MENSAGENS_BLOQUEIO_LIMITE.LIMITE_DIARIO_GRATUITO(dados.notasHoje, maxDia, dados.checkoutUrl)
    };
  }

  return { permitido: true };
}
