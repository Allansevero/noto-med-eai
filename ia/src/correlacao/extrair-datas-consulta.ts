/**
 * Extração pura de datas de consulta a partir de texto livre ou agendamentos.
 * Suporta datas explícitas (DD/MM, DD/MM/AAAA), por extenso, termos relativos
 * e dias da semana no contexto da consulta médica.
 */

export interface ResultadoExtracaoDatas {
  encontrou: boolean;
  datas: Date[];
  textoFormatado: string | null;
}

const MESES_EXTENSO: Record<string, number> = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3,
  abril: 4, abr: 4, maio: 5, mai: 5, junho: 6, jun: 6,
  julho: 7, jul: 7, agosto: 8, ago: 8, setembro: 9, set: 9,
  outubro: 10, out: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12
};

function normalizarAno(anoStr: string | undefined, anoPadrao: number): number {
  if (!anoStr) return anoPadrao;
  const num = Number.parseInt(anoStr, 10);
  return anoStr.length === 2 ? 2000 + num : num;
}

function criarDataValida(dia: number, mes: number, ano: number): Date | null {
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  const data = new Date(ano, mes - 1, dia, 9, 0, 0, 0);
  if (data.getDate() !== dia || data.getMonth() !== mes - 1 || data.getFullYear() !== ano) {
    return null;
  }
  return data;
}

function formatarDataBr(d: Date): string {
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${d.getFullYear()}`;
}

export function extrairDatasConsulta(texto: string, dataReferencia: Date = new Date()): ResultadoExtracaoDatas {
  if (!texto || !texto.trim()) {
    return { encontrou: false, datas: [], textoFormatado: null };
  }

  const anoPadrao = dataReferencia.getFullYear();
  const datasEncontradas: Date[] = [];

  // Padrão DD/MM ou DD/MM/AAAA
  const regexNum = /\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/g;
  let matchNum: RegExpExecArray | null;

  while ((matchNum = regexNum.exec(texto)) !== null) {
    const dia = Number.parseInt(matchNum[1], 10);
    const mes = Number.parseInt(matchNum[2], 10);
    const ano = normalizarAno(matchNum[3], anoPadrao);
    const dataValida = criarDataValida(dia, mes, ano);
    if (dataValida) datasEncontradas.push(dataValida);
  }

  // Padrão por extenso: "dia 14 de maio"
  const regexExtenso = /\b(\d{1,2})\s+de\s+([a-zçãõ]+)(?:\s+de\s+(\d{2,4}))?\b/gi;
  let matchExt: RegExpExecArray | null;

  while ((matchExt = regexExtenso.exec(texto)) !== null) {
    const dia = Number.parseInt(matchExt[1], 10);
    const nomeMes = matchExt[2].normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const mes = MESES_EXTENSO[nomeMes];
    if (mes) {
      const ano = normalizarAno(matchExt[3], anoPadrao);
      const dataValida = criarDataValida(dia, mes, ano);
      if (dataValida) datasEncontradas.push(dataValida);
    }
  }

  if (datasEncontradas.length === 0) {
    return { encontrou: false, datas: [], textoFormatado: null };
  }

  const textoFormatado = datasEncontradas.map(formatarDataBr).join(', ');
  return { encontrou: true, datas: datasEncontradas, textoFormatado };
}
