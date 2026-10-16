/**
 * Extração pura de datas de consulta a partir de texto livre ou comando de emissão.
 * Suporta datas explícitas (DD/MM, DD/MM/AAAA), por extenso ("13 de outubro"),
 * múltiplas datas ("dias 10, 15 e 20/09"), "dia DD" contextual, termos relativos
 * (hoje, ontem, anteontem, amanhã) e dias da semana em contexto de agendamento.
 */

export interface ResultadoExtracaoDatas {
  encontrou: boolean;
  datas: Date[];
  textoFormatado: string | null;
}

const MESES_EXTENSO: Record<string, number> = {
  janeiro: 1, jan: 1,
  fevereiro: 2, fev: 2,
  marco: 3, mar: 3,
  abril: 4, abr: 4,
  maio: 5, mai: 5,
  junho: 6, jun: 6,
  julho: 7, jul: 7,
  agosto: 8, ago: 8,
  setembro: 9, set: 9,
  outubro: 10, out: 10,
  novembro: 11, nov: 11,
  dezembro: 12, dez: 12
};

const DIAS_SEMANA: Record<string, number> = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6
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

function extrairDatasMultiplasMesmoMes(texto: string, anoPadrao: number): Date[] {
  const regex = /(?:dias?\s+)?(?<![\/\d])\b(\d{1,2})\b(?!\/)(?:\s*,\s*(?<![\/\d])\b(\d{1,2})\b(?!\/))?\s*(?:e|a)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/gi;
  const resultado: Date[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(texto)) !== null) {
    const mes = Number.parseInt(match[4], 10);
    const ano = normalizarAno(match[5], anoPadrao);
    const dias = [match[1], match[2], match[3]].filter(Boolean).map(v => Number.parseInt(v!, 10));
    for (const dia of dias) {
      const d = criarDataValida(dia, mes, ano);
      if (d) resultado.push(d);
    }
  }
  return resultado;
}

function extrairDatasCompletas(texto: string, anoPadrao: number): Date[] {
  const regex = /\b(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?\b/g;
  const resultado: Date[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(texto)) !== null) {
    const dia = Number.parseInt(match[1], 10);
    const mes = Number.parseInt(match[2], 10);
    const ano = normalizarAno(match[3], anoPadrao);
    const data = criarDataValida(dia, mes, ano);
    if (data) resultado.push(data);
  }
  return resultado;
}

function extrairDatasPorExtenso(texto: string, anoPadrao: number): Date[] {
  const norm = texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const regex = /\b(\d{1,2})\s+de\s+(janeiro|jan|fevereiro|fev|marco|mar|abril|abr|maio|mai|junho|jun|julho|jul|agosto|ago|setembro|set|outubro|out|novembro|nov|dezembro|dez)(?:\s+de\s+(\d{2,4}))?\b/g;
  const resultado: Date[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(norm)) !== null) {
    const dia = Number.parseInt(match[1], 10);
    const mes = MESES_EXTENSO[match[2]];
    const ano = normalizarAno(match[3], anoPadrao);
    const data = mes ? criarDataValida(dia, mes, ano) : null;
    if (data) resultado.push(data);
  }
  return resultado;
}

function extrairDatasRelativas(texto: string, agora: Date): Date[] {
  const norm = texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 9, 0, 0, 0);

  if (/\bdepois\s+de\s+amanha\b/.test(norm)) {
    return [new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 2, 9, 0, 0, 0)];
  }
  if (/\banteontem\b/.test(norm)) {
    return [new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 2, 9, 0, 0, 0)];
  }
  if (/\bamanha\b/.test(norm)) {
    return [new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 1, 9, 0, 0, 0)];
  }
  if (/\bontem\b/.test(norm)) {
    return [new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1, 9, 0, 0, 0)];
  }
  if (/\bhoje\b/.test(norm)) {
    return [hoje];
  }
  return [];
}

function extrairDiaDoMesContextual(texto: string, agora: Date): Date[] {
  const regex = /\bdia\s+(\d{1,2})\b(?![\/\-\.]\d)/gi;
  const resultado: Date[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(texto)) !== null) {
    const dia = Number.parseInt(match[1], 10);
    let mes = agora.getMonth() + 1;
    let ano = agora.getFullYear();
    if (dia < agora.getDate() - 7 && /\b(?:agendad|marcad|confirmad|para\s+o\s+dia|pode\s+ser)\b/i.test(texto)) {
      mes += 1;
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
    }
    const data = criarDataValida(dia, mes, ano);
    if (data) resultado.push(data);
  }
  return resultado;
}

function extrairDiaDaSemanaContextual(texto: string, agora: Date): Date[] {
  const norm = texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  if (!/\b(?:agendad|marcad|confirmad|consulta|atendimento|retorno|sessao|procedimento|horario|combinad)\b/.test(norm)) {
    return [];
  }
  const match = norm.match(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\b/);
  if (!match) return [];

  const alvo = DIAS_SEMANA[match[1]];
  const atual = agora.getDay();
  const ehPassado = /\b(?:passad[oa]|ultim[oa]|foi\s+na)\b/.test(norm);
  let delta = ehPassado ? -((atual - alvo + 7) % 7 || 7) : (alvo - atual + 7) % 7;
  if (delta === 0 && !ehPassado && /\b(?:proxima|que\s+vem)\b/.test(norm)) delta = 7;

  return [new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + delta, 9, 0, 0, 0)];
}

export function extrairDatasConsulta(
  texto: string | null | undefined,
  agora: Date = new Date()
): ResultadoExtracaoDatas {
  if (!texto || !texto.trim()) {
    return { encontrou: false, datas: [], textoFormatado: null };
  }

  const anoPadrao = agora.getFullYear();
  let datas = extrairDatasMultiplasMesmoMes(texto, anoPadrao);
  if (datas.length === 0) datas = extrairDatasCompletas(texto, anoPadrao);
  if (datas.length === 0) datas = extrairDatasPorExtenso(texto, anoPadrao);
  if (datas.length === 0) datas = extrairDatasRelativas(texto, agora);
  if (datas.length === 0) datas = extrairDiaDoMesContextual(texto, agora);
  if (datas.length === 0) datas = extrairDiaDaSemanaContextual(texto, agora);

  if (datas.length === 0) {
    return { encontrou: false, datas: [], textoFormatado: null };
  }

  const mapaUnico = new Map<number, Date>();
  for (const d of datas) mapaUnico.set(d.getTime(), d);
  const ordenadas = Array.from(mapaUnico.values()).sort((a, b) => a.getTime() - b.getTime());

  return {
    encontrou: true,
    datas: ordenadas,
    textoFormatado: ordenadas.map(formatarDataBr).join(', ')
  };
}

