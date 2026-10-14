/**
 * Normaliza número de telefone brasileiro para o formato internacional com DDI 55
 * e DDD + número (10 ou 11 dígitos após o 55).
 * Remove caracteres de formatação e adiciona 55 se ausente.
 */

export function normalizarTelefone(valor: string): string | null {
  const digitos = valor.replace(/\D/g, '');
  if (/^55\d{10,11}$/.test(digitos)) return digitos;
  if (/^\d{10,11}$/.test(digitos)) return '55' + digitos;
  return null;
}
