/**
 * Motor de autocorreção e self-healing fiscal autônomo da IA.
 * Analisa rejeições retornadas pelo SEFIN/Serpro (ex: confusão MEI x ME, alíquota incorreta),
 * determina a correção necessária sem intervenção humana e devolve a ação corretiva.
 */

import type {
  RequisicaoAutocorrigirFalha,
  RespostaAutocorrigirFalhaSucesso
} from '../../../contratos/tipos-ia.js';

export function diagnosticarEAutocorrigirFalha(
  requisicao: RequisicaoAutocorrigirFalha
): RespostaAutocorrigirFalhaSucesso {
  const { erroSefin } = requisicao;
  const msgErro = (erroSefin.mensagem || '').toLowerCase();
  const codErro = (erroSefin.codigo || '').toUpperCase();

  // 1. Diagnóstico: Incompatibilidade MEI x Microempresa / Simples Nacional
  if (
    codErro === 'E172' ||
    msgErro.includes('mei') ||
    msgErro.includes('microempreendedor individual') ||
    msgErro.includes('regime tributario incompativel') ||
    msgErro.includes('optante pelo simples')
  ) {
    return {
      sucesso: true,
      diagnostico: 'conflito_regime_tributario_mei',
      podeCorrigirAutonomamente: true,
      acaoRecomendada: {
        tipo: 'atualizar_parametro_fiscal_e_reemitir',
        alteracoesParametros: {
          regimeTributario: 'simples_nacional_microempresa',
          optanteSimples: true,
          codigoTributacaoNacional: '040101'
        }
      },
      explicacaoTecnica: 'Detectado enquadramento de Microempresa (ME) divergente do código do MEI. Parâmetro tributário corrigido para Simples Nacional e autorizada reemissão.'
    };
  }

  // 2. Diagnóstico: Divergência de alíquota do ISS municipal
  if (
    codErro === 'E170' ||
    msgErro.includes('aliquota') ||
    msgErro.includes('aliq.') ||
    msgErro.includes('percentual iss')
  ) {
    return {
      sucesso: true,
      diagnostico: 'aliquota_iss_divergente',
      podeCorrigirAutonomamente: true,
      acaoRecomendada: {
        tipo: 'atualizar_parametro_fiscal_e_reemitir',
        alteracoesParametros: {
          aliquotaIss: 2.01
        }
      },
      explicacaoTecnica: 'Alíquota informada rejeitada pela prefeitura/SEFIN. Alíquota ajustada para o piso padrão de 2,01% para reprocessamento.'
    };
  }

  // 3. Rejeição cadastral de tomador (não passível de autocorreção pura)
  return {
    sucesso: true,
    diagnostico: 'documento_tomador_invalido_ou_bloqueado',
    podeCorrigirAutonomamente: false,
    acaoRecomendada: {
      tipo: 'solicitar_ajuste_manual_medico'
    },
    explicacaoTecnica: `Rejeição SEFIN (${codErro || 'SEM_CODIGO'}): ${erroSefin.mensagem}. Requer conferência dos dados do paciente com o médico.`
  };
}
