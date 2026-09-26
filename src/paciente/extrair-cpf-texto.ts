/**
 * Extração oportunista de CPF a partir de texto livre de mensagens do WhatsApp.
 * Varre o texto em busca de padrões mascarados ou numéricos e valida o dígito
 * verificador antes de retornar, evitando falsos positivos (seção 2.1 e 2.3 do plano).
 */

import { validarCpf } from './validar-cpf.js';

export function extrairCpfTexto(texto?: string | null): string | null {
  if (!texto || typeof texto !== 'string') {
    return null;
  }

  // Procura padrão mascarado (ex.: 123.456.789-00) ou sequência de 11 dígitos
  const padroes = [
    /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g,
    /\b\d{11}\b/g
  ];

  for (const regex of padroes) {
    const matches = texto.match(regex);
    if (!matches) continue;

    for (const candidato of matches) {
      const apenasDigitos = candidato.replace(/\D/g, '');
      if (validarCpf(apenasDigitos)) {
        return apenasDigitos;
      }
    }
  }

  return null;
}
