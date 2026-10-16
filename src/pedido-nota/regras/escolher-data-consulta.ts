/**
 * Normalização e validação pura da data da consulta médica.
 * Prioriza a data informada explicitamente pelo médico, recorre à data da fonte
 * (planilha ou confirmação do WhatsApp) e, por fim, adota a data de hoje.
 * Garante que a data não seja futura nem anterior a 5 anos.
 */

export interface EscolherDataParams {
  textoData?: string | null;
  dataSugeridaFonte?: string | null;
  dataReferencia?: Date;
}

export function escolherDataConsulta(params: EscolherDataParams): string {
  const agora = params.dataReferencia || new Date();

  if (params.textoData && params.textoData.trim()) {
    const parseada = interpretarExpressaoData(params.textoData.trim(), agora);
    if (parseada) return formatarData(parseada);
  }

  if (params.dataSugeridaFonte && params.dataSugeridaFonte.trim()) {
    const parseadaFonte = interpretarExpressaoData(params.dataSugeridaFonte.trim(), agora);
    if (parseadaFonte) return formatarData(parseadaFonte);
  }

  return formatarData(agora);
}

function interpretarExpressaoData(expressao: string, agora: Date): Date | null {
  const texto = expressao.toLowerCase().trim();

  if (texto === 'hoje') {
    return agora;
  }

  if (texto === 'ontem') {
    const d = new Date(agora);
    d.setDate(d.getDate() - 1);
    return d;
  }

  if (texto === 'anteontem') {
    const d = new Date(agora);
    d.setDate(d.getDate() - 2);
    return d;
  }

  // Padrão DD/MM/YYYY ou DD/MM/YY
  const matchBarra = texto.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (matchBarra && matchBarra[1] && matchBarra[2]) {
    const dia = Number.parseInt(matchBarra[1], 10);
    const mes = Number.parseInt(matchBarra[2], 10);
    let ano = matchBarra[3] ? Number.parseInt(matchBarra[3], 10) : agora.getFullYear();
    if (ano < 100) ano += 2000;

    return validarLimitesData(dia, mes, ano, agora);
  }

  // Padrão ISO YYYY-MM-DD
  const matchIso = texto.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (matchIso && matchIso[1] && matchIso[2] && matchIso[3]) {
    const ano = Number.parseInt(matchIso[1], 10);
    const mes = Number.parseInt(matchIso[2], 10);
    const dia = Number.parseInt(matchIso[3], 10);
    return validarLimitesData(dia, mes, ano, agora);
  }

  // "dia 14" ou "dia 5" (assume mês e ano atual)
  const matchDia = texto.match(/\bdia\s+(\d{1,2})\b/);
  if (matchDia && matchDia[1]) {
    const dia = Number.parseInt(matchDia[1], 10);
    return validarLimitesData(dia, agora.getMonth() + 1, agora.getFullYear(), agora);
  }

  return null;
}

function validarLimitesData(dia: number, mes: number, ano: number, agora: Date): Date | null {
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || ano < 2000 || ano > 2100) {
    return null;
  }

  const data = new Date(ano, mes - 1, dia, 12, 0, 0);
  if (Number.isNaN(data.getTime())) return null;

  // Tolerância de 1 dia para fuso horário futuro
  const limiteFuturo = new Date(agora);
  limiteFuturo.setDate(limiteFuturo.getDate() + 1);
  if (data.getTime() > limiteFuturo.getTime()) {
    return null;
  }

  // Limite máximo de 5 anos no passado
  const limitePassado = new Date(agora);
  limitePassado.setFullYear(limitePassado.getFullYear() - 5);
  if (data.getTime() < limitePassado.getTime()) {
    return null;
  }

  return data;
}

function formatarData(data: Date): string {
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();
  return `${dia}/${mes}/${ano}`;
}
