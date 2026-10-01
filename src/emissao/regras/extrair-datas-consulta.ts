/**
 * Extração pura de datas de consulta a partir do texto do comando de emissão.
 * Suporta datas explícitas (DD/MM, DD/MM/AAAA), múltiplas datas (10/09 e 15/09,
 * dias 10, 15 e 20/09) e termos relativos (hoje, ontem).
 * Não realiza I/O nem depende de variáveis de ambiente.
 */

export interface ResultadoExtracaoDatas {
  encontrou: boolean;
  datas: Date[];
  textoFormatado: string | null;
}

function normalizarAno(anoStr: string | undefined, anoPadrao: number): number {
  if (!anoStr) return anoPadrao;
  const num = Number.parseInt(anoStr, 10);
  if (anoStr.length === 2) return 2000 + num;
  return num;
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
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function extrairDatasMultiplasMesmoMes(texto: string, anoPadrao: number): Date[] {
  // Padrão: "dias 10, 15 e 20/09" ou "10 e 15/09" (os primeiros números não têm barra antes nem depois)
  const regex = /(?:dias?\s+)?(?<![\/\d])\b(\d{1,2})\b(?!\/)(?:\s*,\s*(?<![\/\d])\b(\d{1,2})\b(?!\/))?\s*(?:e|a)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/gi;
  const resultado: Date[] = [];
  let match: RegExpExecArray | null;

  while ((match = regex.exec(texto)) !== null) {
    const mes = Number.parseInt(match[4], 10);
    const ano = normalizarAno(match[5], anoPadrao);

    const dia1 = Number.parseInt(match[1], 10);
    const d1 = criarDataValida(dia1, mes, ano);
    if (d1) resultado.push(d1);

    if (match[2]) {
      const dia2 = Number.parseInt(match[2], 10);
      const d2 = criarDataValida(dia2, mes, ano);
      if (d2) resultado.push(d2);
    }

    const diaFinal = Number.parseInt(match[3], 10);
    const df = criarDataValida(diaFinal, mes, ano);
    if (df) resultado.push(df);
  }

  return resultado;
}

function extrairDatasCompletas(texto: string, anoPadrao: number): Date[] {
  // Padrão: DD/MM ou DD/MM/AAAA separados por /, - ou .
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

function extrairDatasRelativas(texto: string, agora: Date): Date[] {
  const normalizado = texto.toLowerCase();
  const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 9, 0, 0, 0);

  if (/\banteontem\b/.test(normalizado)) {
    return [new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 2, 9, 0, 0, 0)];
  }
  if (/\bontem\b/.test(normalizado)) {
    return [new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 1, 9, 0, 0, 0)];
  }
  if (/\bhoje\b/.test(normalizado)) {
    return [hoje];
  }

  return [];
}

export function extrairDatasConsulta(
  texto: string | null | undefined,
  agora: Date = new Date()
): ResultadoExtracaoDatas {
  if (!texto || !texto.trim()) {
    return { encontrou: false, datas: [], textoFormatado: null };
  }

  const anoPadrao = agora.getFullYear();
  let datasEncontradas: Date[] = [];

  // 1. Tenta padrão de múltiplos dias no mesmo mês (ex: "dias 10 e 15/09")
  const multiplas = extrairDatasMultiplasMesmoMes(texto, anoPadrao);
  if (multiplas.length > 0) {
    datasEncontradas = multiplas;
  } else {
    // 2. Busca datas convencionais (ex: 25/09/2026 ou 10/09 e 15/09)
    datasEncontradas = extrairDatasCompletas(texto, anoPadrao);
  }

  // 3. Se nenhuma data explícita foi encontrada, busca termos relativos
  if (datasEncontradas.length === 0) {
    datasEncontradas = extrairDatasRelativas(texto, agora);
  }

  if (datasEncontradas.length === 0) {
    return { encontrou: false, datas: [], textoFormatado: null };
  }

  // Deduplica por timestamp e ordena cronologicamente
  const mapaUnico = new Map<number, Date>();
  for (const d of datasEncontradas) {
    mapaUnico.set(d.getTime(), d);
  }
  const datasOrdenadas = Array.from(mapaUnico.values()).sort((a, b) => a.getTime() - b.getTime());

  const textoFormatado = datasOrdenadas.map(formatarDataBr).join(', ');
  return {
    encontrou: true,
    datas: datasOrdenadas,
    textoFormatado
  };
}
