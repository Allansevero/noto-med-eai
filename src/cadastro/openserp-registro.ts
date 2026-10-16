/**
 * OpenSerp roda em um serviço próprio. Só seus resultados orgânicos entram na
 * mesma extração e comprovação literal usadas para as sugestões profissionais.
 */
import { PesquisaRegistroProfissional, lerFonteRegistro, type OpcoesGoogleRegistro, type FontePesquisaRegistro, type ResultadoOrganicoGoogle } from './google-registro.js';
import type { ResultadoConsulta } from './consultas.js';

interface OpcoesOpenSerp extends Omit<OpcoesGoogleRegistro, 'serperApiKey' | 'fontePesquisa'> {
  baseUrl?: string;
}
const falha = (codigo: string): { estado: 'indisponivel'; codigo: string } => ({ estado: 'indisponivel', codigo });

function endpointPesquisa(baseUrl: string): URL | null {
  try {
    const url = new URL(baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/google/search`;
    return url;
  } catch { return null; }
}

/** Limita o corpo externo antes de desserializar; erros nunca expõem URLs ou nomes. */
async function lerJsonLimitado(resposta: Response): Promise<unknown> {
  const leitor = resposta.body?.getReader();
  if (!leitor) throw new Error('SEM_CORPO');
  const partes: Uint8Array[] = [];
  let tamanho = 0;
  try {
    while (true) {
      const parte = await leitor.read();
      if (parte.done) break;
      tamanho += parte.value.byteLength;
      if (tamanho > 1_048_576) throw new Error('CORPO_EXCEDIDO');
      partes.push(parte.value);
    }
    return JSON.parse(Buffer.concat(partes).toString('utf8'));
  } finally { void leitor.cancel().catch(() => {}); }
}

function criarFonte(opcoes: OpcoesOpenSerp): FontePesquisaRegistro {
  const baseUrl = opcoes.baseUrl?.trim() || '';
  const requisitar = opcoes.requisitar ?? fetch;
  return {
    configurada: !!baseUrl,
    origem: 'Google via OpenSerp (sugestão não oficial)',
    async pesquisar(nome, diagnosticar): Promise<ResultadoConsulta<ResultadoOrganicoGoogle[]>> {
      const url = endpointPesquisa(baseUrl);
      if (!url) return falha('OPENSERP_URL_INVALIDA');
      url.search = new URLSearchParams({ text: `CRM ${nome.trim()}`, limit: '10', lang: 'PT', region: 'BR', format: 'json' }).toString();
      let resposta: Response;
      try {
        resposta = await requisitar(url, {
          method: 'GET', redirect: 'error', signal: AbortSignal.timeout(45_000),
          headers: { Accept: 'application/json' }
        });
      } catch { return falha('OPENSERP_CONSULTA_INDISPONIVEL'); }
      if (!resposta.ok) {
        diagnosticar({ etapa: 'openserp_http', status: resposta.status });
        void resposta.body?.cancel().catch(() => {});
        return falha(`OPENSERP_HTTP_${resposta.status}`);
      }
      let corpo: unknown;
      try { corpo = await lerJsonLimitado(resposta); } catch { return falha('OPENSERP_RESPOSTA_INVALIDA'); }
      if (!corpo || typeof corpo !== 'object' || !('results' in corpo) || !Array.isArray(corpo.results)) return falha('OPENSERP_RESPOSTA_INVALIDA');
      // Falha de motor pode vir no envelope. Não transformá-la em "médico não encontrado".
      const meta = 'meta' in corpo ? corpo.meta : null;
      if (meta && typeof meta === 'object' && 'engines_failed' in meta && Array.isArray(meta.engines_failed) && meta.engines_failed.includes('google')) {
        return falha('OPENSERP_MOTOR_INDISPONIVEL');
      }
      const organicos = corpo.results.filter((item: unknown): item is Record<string, unknown> => !!item && typeof item === 'object' && 'type' in item && item.type === 'organic');
      const fontes = organicos.slice(0, 10).map((item, indice) => lerFonteRegistro({ title: item.title, snippet: item.snippet, link: item.url }, indice))
        .filter((f): f is ResultadoOrganicoGoogle => !!f);
      diagnosticar({ etapa: 'openserp', resultados: corpo.results.length, fontesUtilizaveis: fontes.length,
        fontesComMencaoRqe: fontes.filter(f => /\bRQE\b/iu.test(`${f.titulo}\n${f.trecho}`)).length });
      return fontes.length ? { estado: 'consultado', dados: fontes } : { estado: 'nao_encontrado', codigo: 'OPENSERP_SEM_RESULTADOS_UTILIZAVEIS' };
    }
  };
}

export class OpenSerpConsultaRegistro extends PesquisaRegistroProfissional {
  constructor(opcoes: OpcoesOpenSerp) {
    super({ ...opcoes, fontePesquisa: criarFonte(opcoes) });
  }
}
