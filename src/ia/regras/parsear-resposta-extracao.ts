/**
 * Parser e normalizador da resposta bruta retornada pela IA.
 * Trata o retorno como dado não confiável, higienizando caracteres,
 * validando formato de CPF, e-mail e convertendo valores monetários para centavos.
 */

import type { DadosExtracaoIa } from '../extrator-ia-service.js';

export function sanitizarJsonBruto(conteudoBruto: string): string {
  const limpo = conteudoBruto.trim();
  const blocoCodigo = limpo.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return blocoCodigo ? (blocoCodigo[1]?.trim() ?? '') : limpo;
}

export function normalizarCpfExtracao(cpfBruto?: unknown): string | null {
  if (typeof cpfBruto !== 'string') return null;
  const digitos = cpfBruto.replace(/\D/g, '');
  if (digitos.length !== 11) return null;
  return digitos;
}

export function normalizarValorCentavos(objeto: Record<string, unknown>): number | null {
  if (typeof objeto['valor_centavos'] === 'number' && Number.isFinite(objeto['valor_centavos'])) {
    return Math.round(objeto['valor_centavos']);
  }
  if (typeof objeto['valor_reais'] === 'number' && Number.isFinite(objeto['valor_reais'])) {
    return Math.round(objeto['valor_reais'] * 100);
  }
  return null;
}

export function normalizarDataHoraIso(dataStr?: unknown, horaStr?: unknown, isoStr?: unknown): string | null {
  if (typeof isoStr === 'string' && !Number.isNaN(Date.parse(isoStr))) {
    return new Date(isoStr).toISOString();
  }
  if (typeof dataStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
    const hora = typeof horaStr === 'string' && /^\d{2}:\d{2}$/.test(horaStr) ? horaStr : '09:00';
    const combinada = new Date(`${dataStr}T${hora}:00`);
    if (!Number.isNaN(combinada.getTime())) return combinada.toISOString();
  }
  return null;
}

export function parsearRespostaExtracao(conteudoBruto: string): DadosExtracaoIa {
  const jsonLimpo = sanitizarJsonBruto(conteudoBruto);
  let parsed: Record<string, unknown>;

  try {
    parsed = JSON.parse(jsonLimpo);
  } catch {
    return {};
  }

  const nome = typeof parsed['nome_paciente'] === 'string' ? parsed['nome_paciente'].trim() : null;
  const cpf = normalizarCpfExtracao(parsed['cpf']);
  const valor = normalizarValorCentavos(parsed);
  const dataIso = normalizarDataHoraIso(parsed['data'], parsed['horario'], parsed['data_hora_iso']);
  const email = typeof parsed['email'] === 'string' && parsed['email'].includes('@')
    ? parsed['email'].toLowerCase().trim()
    : null;
  const desc = typeof parsed['descricao_servico'] === 'string'
    ? parsed['descricao_servico'].trim()
    : null;

  return {
    nomePaciente: nome || null,
    cpfPaciente: cpf,
    dataConsulta: typeof parsed['data'] === 'string' ? parsed['data'] : null,
    horaConsulta: typeof parsed['horario'] === 'string' ? parsed['horario'] : null,
    dataHoraIso: dataIso,
    valorConsultaCentavos: valor,
    emailPaciente: email,
    especialidadeOuDescricao: desc
  };
}
