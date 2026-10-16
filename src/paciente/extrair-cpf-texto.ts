/**
 * Extração oportunista de CPF a partir de texto livre de mensagens do WhatsApp.
 * Varre o texto em busca de padrões mascarados ou numéricos e valida o dígito
 * verificador antes de retornar, evitando falsos positivos (seção 2.1 e 2.3 do plano).
 */

import { validarCpf } from './validar-cpf.js';

const PADROES_CPF = [
  /(?<!\d)\d{3}\s*[.\-\s]\s*\d{3}\s*[.\-\s]\s*\d{3}\s*[-\/. \s]\s*\d{2}(?!\d)/g,
  /(?<!\d)\d{9}\s*[-\/. ]\s*\d{2}(?!\d)/g,
  /(?<!\d)\d{11}(?!\d)/g,
  /(?:cpf|doc|documento|chave(?:\s+pix)?)\s*:?\s*([0-9.\s\-\/]{11,20})/gi
];

export function extrairTodosCpfsTexto(
  texto?: string | null,
  cpfsIgnorados: string[] = []
): string[] {
  if (!texto || typeof texto !== 'string') return [];

  const ignorados = new Set(cpfsIgnorados.map(c => c.replace(/\D/g, '')).filter(Boolean));
  const encontrados = new Set<string>();

  for (const regex of PADROES_CPF) {
    coletarMatchesPadrao(texto, regex, ignorados, encontrados);
  }

  return Array.from(encontrados);
}

export function extrairCpfTexto(
  texto?: string | null,
  cpfsIgnorados: string[] = []
): string | null {
  const todos = extrairTodosCpfsTexto(texto, cpfsIgnorados);
  return todos[0] ?? null;
}

export interface MensagemDirecionadaCpf {
  direcao: 'recebida' | 'enviada';
  texto?: string | null;
  conteudo?: string | null;
}

const REGEX_CONTEXTO_PIX_CLINICA = /\b(?:chave\s*pix|nosso\s*pix|pix\s*(?:da\s*cl[ií]nica|da\s*dra|do\s*dr|é|e|:)|dados\s*banc[aá]rios|favorecido|conta\s*corrente)\b/i;

export function extrairCpfConversaSegura(
  mensagens: MensagemDirecionadaCpf[],
  cpfsIgnorados: string[] = []
): string | null {
  if (!mensagens || mensagens.length === 0) return null;

  const ignorados = new Set(cpfsIgnorados.map(c => c.replace(/\D/g, '')).filter(Boolean));
  for (const m of mensagens) {
    const texto = m.texto ?? m.conteudo;
    if (m.direcao === 'enviada' && texto && REGEX_CONTEXTO_PIX_CLINICA.test(texto)) {
      for (const cpfPix of extrairTodosCpfsTexto(texto)) {
        ignorados.add(cpfPix);
      }
    }
  }

  const listaIgnorados = Array.from(ignorados);

  for (const m of mensagens) {
    const texto = m.texto ?? m.conteudo;
    if (m.direcao !== 'recebida' || !texto) continue;
    const cpf = extrairCpfTexto(texto, listaIgnorados);
    if (cpf) return cpf;
  }

  for (const m of mensagens) {
    const texto = m.texto ?? m.conteudo;
    if (m.direcao !== 'enviada' || !texto) continue;
    if (REGEX_CONTEXTO_PIX_CLINICA.test(texto)) continue;
    const cpf = extrairCpfTexto(texto, listaIgnorados);
    if (cpf) return cpf;
  }

  return null;
}

function coletarMatchesPadrao(
  texto: string,
  regex: RegExp,
  ignorados: Set<string>,
  encontrados: Set<string>
): void {
  const matches = texto.match(regex);
  if (!matches) return;

  for (const candidato of matches) {
    const apenasDigitos = candidato.replace(/\D/g, '');
    if (apenasDigitos.length !== 11) continue;
    if (ignorados.has(apenasDigitos)) continue;
    if (validarCpf(apenasDigitos)) {
      encontrados.add(apenasDigitos);
    }
  }
}



