/**
 * Extração pura de valor monetário (BRL) para centavos inteiros.
 * Suporta formatos brasileiros comuns como "350", "350,00", "1.250,00", "1.250,50" e "R$ 350".
 * Separado em arquivo próprio para garantir teste exaustivo de regras financeiras.
 */

export function extrairValorMoedaCentavos(texto?: string | null): number | null {
  if (!texto || typeof texto !== 'string') {
    return null;
  }

  // Prioriza número precedido por R$ (evita confundir com datas como 15/10/2026)
  const matchPrefixo = texto.match(/R\$\s*(\d[\d.,]*)/i);
  // Remove datas (ex: 25/09 ou 25/09/2026) para não confundir com valor numérico sem prefixo
  const textoSemDatas = texto.replace(/\b\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?\b/g, ' ');
  const raw = matchPrefixo ? matchPrefixo[1] : textoSemDatas.match(/\d[\d.,]*/)?.[0];
  if (!raw) {
    return null;
  }
  if (raw.includes(',')) {
    // Formato com vírgula para centavos (ex.: "1.250,50" ou "350,00")
    const semPontos = raw.replace(/\./g, '');
    const normalizado = semPontos.replace(',', '.');
    const valor = Number.parseFloat(normalizado);
    return Number.isNaN(valor) ? null : Math.round(valor * 100);
  }

  // Se tiver ponto e 3 dígitos no final (ex.: 1.250), é separador de milhar
  if (/\.\d{3}$/.test(raw)) {
    const semPontos = raw.replace(/\./g, '');
    const valor = Number.parseFloat(semPontos);
    return Number.isNaN(valor) ? null : Math.round(valor * 100);
  }

  // Formato decimal padrão ou inteiro simples (ex.: "350" ou "350.50")
  const valor = Number.parseFloat(raw);
  return Number.isNaN(valor) ? null : Math.round(valor * 100);
}
