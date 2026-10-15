/**
 * Pré-filtro determinístico e extração inicial de CPF, telefone e valor monetário.
 * Evita chamadas desnecessárias à IA quando o médico não está solicitando nota,
 * e protege CPFs e telefones de alucinações de modelos generativos.
 */

import { validarCpf } from '../../paciente/validar-cpf.js';

export interface PreDeteccaoPedido {
  ehCandidatoPedido: boolean;
  cpfLimpo?: string | null;
  telefone?: string | null;
  valorCentavos?: number | null;
}

const PALAVRAS_CHAVE_PEDIDO = [
  'nota',
  'nf',
  'nfse',
  'nfs-e',
  'danfse',
  'emitir',
  'emite',
  'emissao',
  'emissão',
  'faturar',
  'fatura',
  'recibo',
  'consulta'
];

export function detectarPrePedidoNota(texto: string): PreDeteccaoPedido {
  if (!texto || typeof texto !== 'string') {
    return { ehCandidatoPedido: false };
  }

  const normalizado = texto.toLowerCase();
  const temGatilho = PALAVRAS_CHAVE_PEDIDO.some(p => normalizado.includes(p));

  const cpf = extrairCpfSeValido(texto);
  const telefone = extrairTelefone(texto);
  const valorCentavos = extrairValorCentavos(texto);

  // Se tiver um CPF válido no texto, mesmo com poucas palavras, é forte candidato a nota
  const ehCandidatoPedido = temGatilho || Boolean(cpf);

  return {
    ehCandidatoPedido,
    cpfLimpo: cpf,
    telefone,
    valorCentavos
  };
}

function extrairCpfSeValido(texto: string): string | null {
  const matches = texto.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g);
  if (!matches) return null;

  for (const m of matches) {
    const limpo = m.replace(/\D/g, '');
    if (limpo.length === 11 && validarCpf(limpo)) {
      return limpo;
    }
  }

  return null;
}

function extrairTelefone(texto: string): string | null {
  // Padrão brasileiro com DDD: (XX) 9XXXX-XXXX ou XX9XXXXXXXX ou com prefixo 55
  const matches = texto.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9\s?\d{4}[-\s]?\d{4}\b/g);
  if (!matches) return null;

  for (const m of matches) {
    const limpo = m.replace(/\D/g, '');
    if (limpo.length === 10 || limpo.length === 11 || (limpo.length === 13 && limpo.startsWith('55'))) {
      return limpo;
    }
  }

  return null;
}

function extrairValorCentavos(texto: string): number | null {
  // R$ 350,00 ou 400 reais ou R$450
  const matchMoeda = texto.match(/(?:r\$\s*|valor\s*(?:de\s*)?)(\d{1,5}(?:[.,]\d{2})?)/i);
  if (matchMoeda && matchMoeda[1]) {
    return converterParaCentavos(matchMoeda[1]);
  }

  const matchReais = texto.match(/(\d{1,5}(?:[.,]\d{2})?)\s*(?:reais|pila)/i);
  if (matchReais && matchReais[1]) {
    return converterParaCentavos(matchReais[1]);
  }

  return null;
}

function converterParaCentavos(numStr: string): number | null {
  const limpo = numStr.replace(/\./g, '').replace(',', '.');
  const num = Number.parseFloat(limpo);
  if (Number.isNaN(num) || num <= 0 || num > 50000) return null;
  return Math.round(num * 100);
}
