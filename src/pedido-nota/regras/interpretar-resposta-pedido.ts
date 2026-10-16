/**
 * Parser puro da resposta do médico durante um diálogo ativo de pedido de nota.
 * Identifica confirmação, cancelamento, seleção numérica de paciente ambíguo,
 * ajuste de valor ou fornecimento de dados faltantes (CPF, telefone, valor).
 */

import { validarCpf } from '../../paciente/validar-cpf.js';

export type AcaoRespostaPedido =
  | { acao: 'confirmar'; valorAjustadoCentavos?: number }
  | { acao: 'cancelar' }
  | { acao: 'escolher_opcao'; indice: number }
  | { acao: 'fornecer_dados'; cpf?: string; telefone?: string; valorCentavos?: number }
  | { acao: 'ignorar' };

const AFIRMACOES = ['sim', 's', 'pode', 'ok', 'emite', 'emitir', 'confirmo', 'confirmar', 'positivo', 'manda', 'autorizo', 'pode emitir'];
const NEGATIVAS = ['nao', 'não', 'cancela', 'cancelar', 'cancelo', 'deixa', 'esquece', 'aborta', 'espera', 'agora nao', 'agora não'];

export function interpretarRespostaPedido(textoRecebido: string): AcaoRespostaPedido {
  if (!textoRecebido || typeof textoRecebido !== 'string') {
    return { acao: 'ignorar' };
  }

  const texto = textoRecebido.trim().toLowerCase();

  if (NEGATIVAS.includes(texto)) {
    return { acao: 'cancelar' };
  }

  if (AFIRMACOES.includes(texto)) {
    return { acao: 'confirmar' };
  }

  // Verifica se respondeu um número de opção (ex: "1" ou "2")
  const matchOpcao = texto.match(/^(?:opcao\s+|opção\s+|n[ºo°]?\s*)?([1-9])$/i);
  if (matchOpcao && matchOpcao[1]) {
    const indice = Number.parseInt(matchOpcao[1], 10) - 1;
    return { acao: 'escolher_opcao', indice };
  }

  // Verifica se respondeu apenas um valor monetário (ex: "400", "450 reais", "R$ 350,00")
  const valorIsolado = extrairValorIsolado(texto);
  if (valorIsolado) {
    return { acao: 'confirmar', valorAjustadoCentavos: valorIsolado };
  }

  // Verifica se forneceu dados cadastrais (CPF, telefone ou valor)
  const dados = extrairDadosFornecidos(textoRecebido);
  if (dados.cpf || dados.telefone || dados.valorCentavos) {
    return { acao: 'fornecer_dados', ...dados };
  }

  return { acao: 'ignorar' };
}

function extrairValorIsolado(texto: string): number | null {
  const match = texto.match(/^(?:r\$\s*|valor\s*(?:de\s*)?)?(\d{1,5}(?:[.,]\d{2})?)(?:\s*(?:reais|pila))?$/i);
  if (!match || !match[1]) return null;

  const limpo = match[1].replace(/\./g, '').replace(',', '.');
  const num = Number.parseFloat(limpo);
  if (Number.isNaN(num) || num <= 0 || num > 50000) return null;
  return Math.round(num * 100);
}

function extrairDadosFornecidos(texto: string): { cpf?: string; telefone?: string; valorCentavos?: number } {
  let cpf: string | undefined;
  const matchCpf = texto.match(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/);
  if (matchCpf) {
    const limpo = matchCpf[0].replace(/\D/g, '');
    if (limpo.length === 11 && validarCpf(limpo)) {
      cpf = limpo;
    }
  }

  let telefone: string | undefined;
  const matchTel = texto.match(/(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9\s?\d{4}[-\s]?\d{4}\b/);
  if (matchTel) {
    const limpo = matchTel[0].replace(/\D/g, '');
    if (limpo.length >= 10 && limpo.length <= 13) {
      telefone = limpo;
    }
  }

  let valorCentavos: number | undefined;
  const matchValor = texto.match(/(?:r\$\s*|valor\s*(?:de\s*)?)(\d{1,5}(?:[.,]\d{2})?)/i);
  if (matchValor && matchValor[1]) {
    const limpo = matchValor[1].replace(/\./g, '').replace(',', '.');
    const num = Number.parseFloat(limpo);
    if (!Number.isNaN(num) && num > 0 && num <= 50000) {
      valorCentavos = Math.round(num * 100);
    }
  }

  return { cpf, telefone, valorCentavos };
}
