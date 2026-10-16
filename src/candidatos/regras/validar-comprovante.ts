/**
 * Validação pura dos dados extraídos do comprovante bancário pelo modelo multimodal.
 * Filtra falsos positivos, valores inválidos e documentos que são na verdade notas fiscais
 * antes de registrar qualquer candidato ou notificar o médico.
 */

import type { DadosComprovanteExtraidos } from '../tipos.js';

export interface ResultadoValidacaoComprovante {
  valido: boolean;
  motivo?: 'nao_eh_comprovante' | 'eh_nota_fiscal' | 'valor_invalido' | 'data_futura';
}

const VALOR_MAXIMO_CENTAVOS = 5_000_000; // R$ 50.000,00 - teto de segurança para consulta médica individual

export function validarComprovante(
  dados: DadosComprovanteExtraidos,
  dataReferencia: Date = new Date()
): ResultadoValidacaoComprovante {
  if (!dados.ehComprovante) {
    return { valido: false, motivo: 'nao_eh_comprovante' };
  }

  if (dados.ehNotaFiscal) {
    return { valido: false, motivo: 'eh_nota_fiscal' };
  }

  if (!dados.valorCentavos || dados.valorCentavos <= 0 || dados.valorCentavos > VALOR_MAXIMO_CENTAVOS) {
    return { valido: false, motivo: 'valor_invalido' };
  }

  if (dados.dataPagamento) {
    const dataPag = new Date(`${dados.dataPagamento}T23:59:59Z`);
    // Margem de 24h para fusos horários
    const limiteFuturo = new Date(dataReferencia.getTime() + 24 * 60 * 60 * 1000);
    if (!isNaN(dataPag.getTime()) && dataPag > limiteFuturo) {
      return { valido: false, motivo: 'data_futura' };
    }
  }

  return { valido: true };
}
