/**
 * Extração determinística de registros médicos (CRM e RQE) e citações literais
 * a partir dos snippets orgânicos de busca. Isolado do cliente HTTP/IA para
 * permitir resolução instantânea (< 1ms) sem depender de latência de LLM.
 */
import { normalizarCrm } from '../conta/validar-dados-emissao.js';

export interface ResultadoOrganicoGoogle { indice: number; titulo: string; trecho: string; url: string }
export interface Evidencia { fonte: number; trecho?: string; trechos?: string[] }
export interface ExtracaoRqe { numero: string; uf?: string | null; evidencia: Evidencia }
export interface ExtracaoRegistro { nomeCompleto: string; crm: string; uf: string; evidenciaCrm: Evidencia; rqes?: ExtracaoRqe[] }
export type RegistroValidado = { crm: string; uf: string };

const UFS_BRASIL = 'AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO';

export const normalizarTexto = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR');

function normalizarNumero(valor: string): string {
  return valor.replace(/\D/g, '');
}

export function registroInativo(texto: string): boolean {
  return /\b(?:transferid[oa]s?|cancelad[oa]s?|inativ[oa]s?|suspens[oa]s?|cassad[oa]s?)\b/iu.test(texto);
}

export function extrairCrms(texto: string): RegistroValidado[] {
  const encontrados: RegistroValidado[] = [];
  const formatador = String.raw`(\d{1,3}(?:\.\d{3})+|\d+)`;
  const padroes = [
    new RegExp(String.raw`\bCRM\s*[-/:\s]+(${UFS_BRASIL})\b\s*[:#\-]?\s*(?:n[º°.]?\s*)?${formatador}(?!\d)`, 'giu'),
    new RegExp(String.raw`\bCRM\s*[:#\-]?\s*(?:n[º°.]?\s*)?${formatador}\s*(?:[/\-]|\s)\s*(${UFS_BRASIL})\b`, 'giu')
  ];
  for (const padrao of padroes) {
    for (const match of texto.matchAll(padrao)) {
      const uf = (padrao === padroes[0] ? match[1] : match[2]).toUpperCase();
      const numero = normalizarNumero(padrao === padroes[0] ? match[2] : match[1]);
      const crm = normalizarCrm(`${numero}/${uf}`);
      if (crm) encontrados.push({ crm: crm.split('/')[0], uf: crm.split('/')[1] });
    }
  }
  return [...new Map(encontrados.map(r => [`${r.crm}/${r.uf}`, r])).values()];
}

export function extrairRqes(texto: string): Array<{ numero: string; uf?: string }> {
  const encontrados: Array<{ numero: string; uf?: string }> = [];
  const formatador = String.raw`(\d{1,3}(?:\.\d{3})+|\d+)`;
  const padroes = [
    new RegExp(String.raw`\bRQE\s*[-/:\s]+(${UFS_BRASIL})\b\s*[:#\-]?\s*(?:n[º°.]?\s*)?${formatador}(?!\d)`, 'giu'),
    new RegExp(String.raw`\bRQE\s*[:#\-]?\s*(?:n[º°.]?\s*)?${formatador}(?!\d)(?:\s*(?:[/\-]|\s)\s*(${UFS_BRASIL})\b)?`, 'giu')
  ];
  for (const padrao of padroes) {
    for (const match of texto.matchAll(padrao)) {
      const uf = (padrao === padroes[0] ? match[1] : match[2])?.toUpperCase();
      const numero = normalizarNumero(padrao === padroes[0] ? match[2] : match[1]);
      if (/^[1-9]\d{0,11}$/.test(numero)) encontrados.push({ numero, uf });
    }
  }
  return [...new Map(encontrados.map(r => [`${r.numero}/${r.uf}`, r])).values()];
}

function montarTrechosLiterais(nome: string, fonte: ResultadoOrganicoGoogle): string[] {
  const nomeNorm = normalizarTexto(nome);
  if (normalizarTexto(fonte.trecho).includes(nomeNorm) && extrairCrms(fonte.trecho).length === 1 && fonte.trecho.length <= 490) {
    return [fonte.trecho];
  }
  const combinados = [fonte.titulo, fonte.trecho].filter(Boolean);
  if (combinados.join('\n').length <= 490) return combinados;
  return [fonte.titulo.slice(0, 180), fonte.trecho.slice(0, 300)].filter(Boolean);
}

export function extrairRegistrosDeterministico(nome: string, fontes: ResultadoOrganicoGoogle[]): ExtracaoRegistro[] {
  const nomeLimpo = nome.trim();
  const nomeNorm = normalizarTexto(nomeLimpo);
  const porCrm = new Map<string, ExtracaoRegistro>();

  for (const fonte of fontes) {
    const texto = `${fonte.titulo}\n${fonte.trecho}`;
    if (!normalizarTexto(texto).includes(nomeNorm) || registroInativo(texto) || /\bveja tamb[eé]m\b/iu.test(texto)) continue;
    const crms = extrairCrms(texto);
    if (crms.length !== 1) continue;
    const { crm, uf } = crms[0];
    const trechos = montarTrechosLiterais(nomeLimpo, fonte);
    const textoTrechos = trechos.join('\n');
    if (!normalizarTexto(textoTrechos).includes(nomeNorm) || extrairCrms(textoTrechos).length !== 1) continue;

    const chave = `${crm}/${uf}`;
    let registro = porCrm.get(chave);
    if (!registro) {
      registro = { nomeCompleto: nomeLimpo, crm, uf, evidenciaCrm: { fonte: fonte.indice, trechos }, rqes: [] };
      porCrm.set(chave, registro);
    }

    for (const rqe of extrairRqes(textoTrechos)) {
      if (rqe.uf && rqe.uf !== uf) continue;
      const jaIncluido = registro.rqes?.some(item => item.numero === rqe.numero && item.evidencia.fonte === fonte.indice);
      if (!jaIncluido) {
        registro.rqes?.push({ numero: rqe.numero, uf: rqe.uf ?? null, evidencia: { fonte: fonte.indice, trechos } });
      }
    }
  }

  return [...porCrm.values()];
}
