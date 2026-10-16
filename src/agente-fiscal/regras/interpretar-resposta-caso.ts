import { z } from 'zod';
import { validarCpf } from '../../paciente/validar-cpf.js';
import { ehNomeCivilValido } from '../../paciente/regras/validar-nome-civil.js';

export interface ContextoRespostaCaso {
  casoId: string;
  estado: string;
  campoSolicitado?: string | null;
  pacienteNome: string;
  /** Identificador de uma pergunta efetivamente enviada para este caso. */
  perguntaMensagemId?: string | null;
  mensagemCitadaId?: string | null;
}

export const interpretacaoCasoSchema = z.object({
  casoId: z.string().min(1).max(200),
  intencao: z.enum(['aprovar', 'recusar', 'adiar', 'informar_dados', 'consultar', 'esclarecer', 'buscar_candidatos', 'ja_emitida']),
  evidencia: z.string().min(1).max(4000),
  dados: z.object({
    cpf: z.string().max(20).optional(),
    nome: z.string().max(200).optional(),
    dataConsulta: z.string().max(100).optional(),
  }).strict().optional(),
}).strict();

export type ResultadoInterpretacaoCaso = z.infer<typeof interpretacaoCasoSchema>;
export interface InterpretadorCaso {
  interpretar(contexto: ContextoRespostaCaso, texto: string): Promise<ResultadoInterpretacaoCaso>;
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function perguntaDeAprovacaoAtiva(contexto: ContextoRespostaCaso): boolean {
  return contexto.campoSolicitado === 'aprovacao'
    && contexto.estado === 'aguardando_aprovacao'
    && !!contexto.perguntaMensagemId?.trim()
    && (!contexto.mensagemCitadaId || contexto.mensagemCitadaId === contexto.perguntaMensagemId);
}

function esclarecer(contexto: ContextoRespostaCaso, texto: string): ResultadoInterpretacaoCaso {
  return { casoId: contexto.casoId, intencao: 'esclarecer', evidencia: texto.slice(0, 4000) };
}

function dataExplicitaValida(valor: string): boolean {
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(valor);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!br && !iso) return false;
  const ano = Number(br ? br[3] : iso![1]);
  const mes = Number(br ? br[2] : iso![2]);
  const dia = Number(br ? br[1] : iso![3]);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return ano >= 1900 && data.getUTCFullYear() === ano
    && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}

/** A classificação não autoriza efeitos: o fluxo ainda deve conferir estado e persistência. */
export function validarInterpretacaoCaso(
  contexto: ContextoRespostaCaso, texto: string, proposta: unknown,
): ResultadoInterpretacaoCaso {
  const segura = esclarecer(contexto, texto);
  const parsed = interpretacaoCasoSchema.safeParse(proposta);
  if (!parsed.success || texto.length > 4000) return segura;
  const resultado = parsed.data;
  if (resultado.casoId !== contexto.casoId || !texto.includes(resultado.evidencia)) return segura;
  if ((contexto.casoId === 'sem_caso' || contexto.estado === 'sem_caso')
    && !['buscar_candidatos', 'consultar', 'esclarecer'].includes(resultado.intencao)) return segura;
  if (contexto.mensagemCitadaId && contexto.mensagemCitadaId !== contexto.perguntaMensagemId) return segura;
  const n = normalizar(texto);
  // Conteúdo recebido nunca pode mudar o contrato nem delegar autoridade à IA.
  if (/\b(ignore|ignorar|desconsidere|prompt|system|developer|instrucoes|retorne json|responda json)\b/.test(n)) return segura;
  if (resultado.intencao === 'aprovar') {
    if (!perguntaDeAprovacaoAtiva(contexto) || !/\b(sim|aprovar|aprovo|autorizo|autorizado|autorizada|libero|liberado|liberada|pode|emita|emitir|gere|gerar|confirmo|confirmado|confirmada)\b/.test(n) || /[?¿]/.test(texto)
      || /\b(nao|nunca|jamais|nem|talvez|sera|seria|poderia|posso|devo|quando|como|porque|por que|acho|duvida|se|mas|antes|somente|apenas|desde|exemplo|hipotetico|depois|amanha|aguarde|espera|ja emiti|ja emitida)\b/.test(n)) return segura;
  }
  if (resultado.dados && resultado.intencao !== 'informar_dados') return segura;
  if (resultado.intencao === 'informar_dados') {
    const dados = resultado.dados;
    if (!dados || !Object.values(dados).some(Boolean) || /[?¿]/.test(texto)
      || /\b(nao|talvez|exemplo|hipotetico|acho|duvida)\b/.test(n)) return segura;
    for (const valor of Object.values(dados)) {
      if (valor !== undefined && (!valor.trim() || !resultado.evidencia.includes(valor))) return segura;
    }
    if (dados.cpf && (!/^\d{11}$|^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(dados.cpf) || !validarCpf(dados.cpf))) return segura;
    if (dados.nome && (!ehNomeCivilValido(dados.nome)
      || !/^[\p{L}]+(?:[ '\u2019-][\p{L}]+)+$/u.test(dados.nome)
      || /\b(meu nome|me chamo|secretari[oa])\b/.test(n))) return segura;
    if (dados.dataConsulta && !dataExplicitaValida(dados.dataConsulta)) return segura;
  }
  return resultado;
}

/** Atalhos exatos para sim/não e busca; linguagem livre exige o interpretador. */
export async function interpretarRespostaCaso(
  contexto: ContextoRespostaCaso, texto: string, interpretador?: InterpretadorCaso,
): Promise<ResultadoInterpretacaoCaso> {
  const segura = esclarecer(contexto, texto);
  if (!texto.trim() || texto.length > 4000 || !contexto.casoId) return segura;
  const n = normalizar(texto);
  if (perguntaDeAprovacaoAtiva(contexto) && /^(sim|nao|aprovar|recusar|adiar)[.!]?$/.test(n)) {
    return validarInterpretacaoCaso(contexto, texto, {
      casoId: contexto.casoId, intencao: /^(sim|aprovar)/.test(n) ? 'aprovar' : n.startsWith('adiar') ? 'adiar' : 'recusar', evidencia: texto,
    });
  }
  if (/^(?:buscar|busque|procurar|procure) (?:as )?(?:notas|consultas|pagamentos)(?: pendentes)?[.!]?$/.test(n)) {
    return validarInterpretacaoCaso(contexto, texto, {
      casoId: contexto.casoId, intencao: 'buscar_candidatos', evidencia: texto,
    });
  }
  if (contexto.estado === 'aguardando_dados' && contexto.perguntaMensagemId &&
      ['cpf', 'nome', 'dataConsulta'].includes(contexto.campoSolicitado || '')) {
    const direta = validarInterpretacaoCaso(contexto, texto, { casoId: contexto.casoId,
      intencao: 'informar_dados', evidencia: texto, dados: { [contexto.campoSolicitado!]: texto.trim() } });
    if (direta.intencao === 'informar_dados') return direta;
  }
  if (!interpretador) return segura;
  try {
    return validarInterpretacaoCaso(contexto, texto, await interpretador.interpretar(contexto, texto));
  } catch {
    return segura;
  }
}
