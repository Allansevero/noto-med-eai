/**
 * Validação pura de CPF com cálculo oficial dos dígitos verificadores (módulo 11).
 * Não possui dependências externas para garantir performance e testabilidade isolada.
 */

export function validarCpf(cpf?: string | null): boolean {
  if (!cpf || typeof cpf !== 'string') {
    return false;
  }

  const digitos = cpf.replace(/\D/g, '');
  if (digitos.length !== 11) {
    return false;
  }

  // Rejeita sequências conhecidas de dígitos repetidos
  if (/^(\d)\1{10}$/.test(digitos)) {
    return false;
  }

  const primeiroDv = calcularDigito(digitos.slice(0, 9), 10);
  if (primeiroDv !== Number.parseInt(digitos.charAt(9), 10)) {
    return false;
  }

  const segundoDv = calcularDigito(digitos.slice(0, 10), 11);
  return segundoDv === Number.parseInt(digitos.charAt(10), 10);
}

function calcularDigito(base: string, pesoInicial: number): number {
  let soma = 0;
  let peso = pesoInicial;

  for (let i = 0; i < base.length; i++) {
    soma += Number.parseInt(base.charAt(i), 10) * peso;
    peso -= 1;
  }

  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}
