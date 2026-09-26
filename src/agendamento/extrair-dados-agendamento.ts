/**
 * Extração e validação de dados de agendamento a partir de conversas.
 * Trata o texto extraído como não confiável (seção 4.3 do plano), validando
 * formato de data/hora, valor e dados oportunistas (e-mail, CPF, nome).
 */

import { extrairCpfTexto } from '../paciente/extrair-cpf-texto.js';
import { extrairValorMoedaCentavos } from '../whatsapp/extrair-valor-moeda.js';

export interface DadosAgendamentoExtraidos {
  dataHora: Date;
  valorConsultaCentavos?: number | null;
  nomePaciente?: string | null;
  emailPaciente?: string | null;
  cpfPaciente?: string | null;
}

export function extrairEmailOportunista(texto?: string | null): string | null {
  if (!texto) return null;
  const match = texto.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase().trim() : null;
}

export function extrairDataHoraSimples(
  texto: string,
  agora: Date = new Date()
): Date | null {
  // Procura padrão de data DD/MM ou DD/MM/AAAA com horário (ex: 28/09 às 14:30 ou 28/09/2026 15h)
  const regexDataHora = /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?:\s+(?:às|as|at)?\s*(\d{1,2})(?::(\d{2})|h)?)?/i;
  const match = texto.match(regexDataHora);
  if (!match) return null;

  const dia = Number.parseInt(match[1] || '0', 10);
  const mes = Number.parseInt(match[2] || '0', 10) - 1; // 0-indexed
  const ano = match[3]
    ? match[3].length === 2
      ? 2000 + Number.parseInt(match[3], 10)
      : Number.parseInt(match[3], 10)
    : agora.getFullYear();

  const hora = match[4] ? Number.parseInt(match[4], 10) : 9; // default 09:00
  const minuto = match[5] ? Number.parseInt(match[5], 10) : 0;

  const data = new Date(ano, mes, dia, hora, minuto, 0, 0);
  return Number.isNaN(data.getTime()) ? null : data;
}

export function consolidarDadosAgendamento(
  mensagensRecentes: string[],
  agora: Date = new Date()
): DadosAgendamentoExtraidos {
  const textoUnificado = mensagensRecentes.join('\n');
  const dataHora = extrairDataHoraSimples(textoUnificado, agora) ?? agora;
  const valorConsultaCentavos = extrairValorMoedaCentavos(textoUnificado);
  const emailPaciente = extrairEmailOportunista(textoUnificado);
  const cpfPaciente = extrairCpfTexto(textoUnificado);

  return {
    dataHora,
    valorConsultaCentavos,
    emailPaciente,
    cpfPaciente
  };
}
