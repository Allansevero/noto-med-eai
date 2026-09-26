/**
 * Decisão e cálculo do valor final dos serviços da NFS-e.
 * Prioriza o valor digitado diretamente pelo médico no comando /emissao;
 * caso omitido, consolida a soma das consultas em aberto (seção 3.2 do plano).
 */

export interface ResultadoCalculoValor {
  ok: boolean;
  valorCentavos?: number;
  origemValor?: 'digitado' | 'soma_consultas';
  motivo?: 'valor_indisponivel' | 'valor_invalido';
}

export function calcularValorEmissao(
  valorDigitadoCentavos: number | null | undefined,
  valoresConsultasCentavos: (number | null | undefined)[] = []
): ResultadoCalculoValor {
  if (valorDigitadoCentavos !== null && valorDigitadoCentavos !== undefined) {
    if (valorDigitadoCentavos <= 0) {
      return { ok: false, motivo: 'valor_invalido' };
    }
    return { ok: true, valorCentavos: valorDigitadoCentavos, origemValor: 'digitado' };
  }

  const somaCentavos = valoresConsultasCentavos.reduce<number>((total, val) => {
    return total + (typeof val === 'number' && val > 0 ? val : 0);
  }, 0);

  if (somaCentavos <= 0) {
    return { ok: false, motivo: 'valor_indisponivel' };
  }

  return { ok: true, valorCentavos: somaCentavos, origemValor: 'soma_consultas' };
}
