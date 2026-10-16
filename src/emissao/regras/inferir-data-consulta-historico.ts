/**
 * Regra pura para inferir de forma autônoma a data da consulta anterior (ou associada)
 * a um comprovante de pagamento no histórico do WhatsApp. Resolve datas relativas ao
 * timestamp real de cada mensagem, negociações de datas e sinaliza ambiguidade para o LLM.
 */

import { extrairDatasConsulta } from './extrair-datas-consulta.js';

export interface MensagemHistoricoData {
  id: string;
  direcao: 'enviada' | 'recebida';
  tipo: 'texto' | 'imagem' | 'documento' | 'outro';
  conteudo?: string | null;
  criadoEm: Date | string | number;
}

export interface ParametrosInferirDataConsulta {
  mensagensAnteriores: MensagemHistoricoData[];
  msgPagamento: MensagemHistoricoData;
  mensagensPosteriores?: MensagemHistoricoData[];
}

export interface ResultadoInferirDataConsulta {
  dataConsultaFormatada: string;
  dataConsultaIso: string;
  mensagemId?: string;
  trecho?: string;
  confianca: 'alta' | 'media' | 'baixa';
  ambiguo: boolean;
}

const REGEX_AGENDAMENTO_EXPLICITO =
  /(?:agendad[oa]|marcad[oa]|confirmad[oa]|procedimento|consulta|atendimento|sess[aã]o|retorno)\s*(?:para|de|em|no\s+dia|dia)?,?\s*\*?(\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?)\*?/i;

const REGEX_CONTEXTO_CLINICO =
  /(?:agendad|marcad|confirmad|hor[áa]rio|consulta|procedimento|retorno|atendimento|sess[aã]o|lembrete|m[ée]dic|dr|pode\s+ser|combinad|referente|fazer\s+no\s+dia|fica\s+bom)/i;

export function inferirDataConsultaHistorico(
  params: ParametrosInferirDataConsulta
): ResultadoInferirDataConsulta {
  const dataPag = converterParaDate(params.msgPagamento.criadoEm);

  const daLegendaOuPosterior = tentarExtrairJuntoAoComprovante(
    params.msgPagamento,
    params.mensagensPosteriores || [],
    dataPag
  );
  if (daLegendaOuPosterior) return daLegendaOuPosterior;

  const doHistoricoAnterior = tentarExtrairDasMensagensAnteriores(
    params.mensagensAnteriores,
    dataPag
  );
  if (doHistoricoAnterior) return doHistoricoAnterior;

  return {
    dataConsultaFormatada: formatarDataBr(dataPag),
    dataConsultaIso: formatarDataIso(dataPag),
    confianca: 'baixa',
    ambiguo: params.mensagensAnteriores.some(m => Boolean(m.conteudo?.trim()))
  };
}

function tentarExtrairJuntoAoComprovante(
  msgPagamento: MensagemHistoricoData,
  posteriores: MensagemHistoricoData[],
  dataPag: Date
): ResultadoInferirDataConsulta | null {
  if (msgPagamento.conteudo && REGEX_CONTEXTO_CLINICO.test(msgPagamento.conteudo)) {
    const ext = extrairDatasConsulta(msgPagamento.conteudo, dataPag);
    const valida = ext.datas.find(d => dentroDaJanelaPlausivel(d, dataPag));
    if (valida) {
      return montarResultado(valida, msgPagamento.id, msgPagamento.conteudo, 'alta', false);
    }
  }

  for (const pos of posteriores) {
    const dataPos = converterParaDate(pos.criadoEm);
    if (dataPos.getTime() - dataPag.getTime() > 10 * 60 * 1000) break;
    if (pos.direcao !== 'recebida' || !pos.conteudo) continue;
    if (!REGEX_CONTEXTO_CLINICO.test(pos.conteudo)) continue;

    const ext = extrairDatasConsulta(pos.conteudo, dataPos);
    const valida = ext.datas.find(d => dentroDaJanelaPlausivel(d, dataPag));
    if (valida) {
      return montarResultado(valida, pos.id, pos.conteudo, 'alta', false);
    }
  }

  return null;
}

function tentarExtrairDasMensagensAnteriores(
  anteriores: MensagemHistoricoData[],
  dataPag: Date
): ResultadoInferirDataConsulta | null {
  for (let i = anteriores.length - 1; i >= 0; i--) {
    const msg = anteriores[i];
    const texto = (msg.conteudo || '').trim();
    if (!texto) continue;

    const dataMsg = converterParaDate(msg.criadoEm);
    const matchExplicito = texto.match(REGEX_AGENDAMENTO_EXPLICITO);
    if (matchExplicito) {
      const ext = extrairDatasConsulta(matchExplicito[1], dataMsg);
      const valida = ext.datas.find(d => dentroDaJanelaPlausivel(d, dataPag));
      if (valida) {
        return montarResultado(valida, msg.id, matchExplicito[0], 'alta', false);
      }
    }

    if (!REGEX_CONTEXTO_CLINICO.test(texto)) continue;

    const resolvidaOpcao = resolverEscolhaDeOpcoes(anteriores, i, dataPag);
    if (resolvidaOpcao) return resolvidaOpcao;

    const ext = extrairDatasConsulta(texto, dataMsg);
    const plausiveis = ext.datas.filter(d => dentroDaJanelaPlausivel(d, dataPag));
    if (plausiveis.length > 0) {
      const temOpcoesOu = plausiveis.length > 1 && /\bou\b/i.test(texto);
      const escolhida = plausiveis[plausiveis.length - 1];
      return montarResultado(
        escolhida,
        msg.id,
        texto.slice(0, 100),
        temOpcoesOu ? 'media' : 'alta',
        temOpcoesOu
      );
    }
  }

  return null;
}

function resolverEscolhaDeOpcoes(
  anteriores: MensagemHistoricoData[],
  indiceAtual: number,
  dataPag: Date
): ResultadoInferirDataConsulta | null {
  const msgAtual = anteriores[indiceAtual];
  const textoAtual = (msgAtual.conteudo || '').trim();
  const matchDia = textoAtual.match(/\bdia\s+(\d{1,2})\b(?![\/\-\.]\d)/i);
  const matchOrdem = textoAtual.match(/\b(primeir[oa]|segund[oa]|[úu]ltim[oa])\b/i);
  if (!matchDia && !matchOrdem) return null;

  for (let j = indiceAtual - 1; j >= Math.max(0, indiceAtual - 4); j--) {
    const msgAnt = anteriores[j];
    const textoAnt = (msgAnt.conteudo || '').trim();
    if (!textoAnt) continue;
    const extAnt = extrairDatasConsulta(textoAnt, converterParaDate(msgAnt.criadoEm));
    const plausiveis = extAnt.datas.filter(d => dentroDaJanelaPlausivel(d, dataPag));
    if (plausiveis.length === 0) continue;

    if (matchDia) {
      const diaEscolhido = Number.parseInt(matchDia[1], 10);
      const correspondente = plausiveis.find(d => d.getDate() === diaEscolhido);
      if (correspondente) {
        return montarResultado(correspondente, msgAtual.id, textoAtual.slice(0, 100), 'alta', false);
      }
    }
    if (matchOrdem && plausiveis.length >= 2) {
      const termo = matchOrdem[1].toLowerCase();
      const idx = termo.startsWith('primeir') ? 0 : plausiveis.length - 1;
      return montarResultado(plausiveis[idx], msgAtual.id, textoAtual.slice(0, 100), 'alta', false);
    }
  }
  return null;
}

function dentroDaJanelaPlausivel(dataCandidata: Date, dataPagamento: Date): boolean {
  const diffMs = dataPagamento.getTime() - dataCandidata.getTime();
  const diffDias = diffMs / (1000 * 60 * 60 * 24);
  return diffDias >= -45 && diffDias <= 90;
}

function montarResultado(
  data: Date,
  mensagemId: string,
  trecho: string,
  confianca: 'alta' | 'media' | 'baixa',
  ambiguo: boolean
): ResultadoInferirDataConsulta {
  return {
    dataConsultaFormatada: formatarDataBr(data),
    dataConsultaIso: formatarDataIso(data),
    mensagemId,
    trecho,
    confianca,
    ambiguo
  };
}

function converterParaDate(valor: Date | string | number): Date {
  return valor instanceof Date ? valor : new Date(valor);
}

function formatarDataBr(d: Date): string {
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${d.getFullYear()}`;
}

function formatarDataIso(d: Date): string {
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}
