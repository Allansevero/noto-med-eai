/**
 * Orquestração pura da cascata de fontes de pacientes (Supabase -> Sheets -> Conversa).
 * Interrompe a busca na primeira fonte que retornar correspondências e decide
 * se o resultado é unívoco, ambíguo (múltiplos com mesmo nome) ou vazio.
 */

import type { PacienteEncontrado } from '../tipos.js';

export type ResultadoCascata =
  | { tipo: 'nenhum' }
  | { tipo: 'unico'; paciente: PacienteEncontrado }
  | { tipo: 'multiplos'; opcoes: PacienteEncontrado[]; fonte: string };

export function resolverCascataFontes(
  resultadosPorFonte: Array<{ fonte: string; pacientes: PacienteEncontrado[] }>
): ResultadoCascata {
  if (!resultadosPorFonte || resultadosPorFonte.length === 0) {
    return { tipo: 'nenhum' };
  }

  for (const item of resultadosPorFonte) {
    if (!item.pacientes || item.pacientes.length === 0) {
      continue;
    }

    if (item.pacientes.length === 1) {
      return {
        tipo: 'unico',
        paciente: item.pacientes[0]
      };
    }

    return {
      tipo: 'multiplos',
      opcoes: item.pacientes,
      fonte: item.fonte
    };
  }

  return { tipo: 'nenhum' };
}
