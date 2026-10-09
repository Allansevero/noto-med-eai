import { z } from 'zod';
import {
  nomeProfissionalValido,
  normalizarCrm
} from '../conta/validar-dados-emissao.js';
import type { EstadoAssistenteMedico } from './gerenciador-conversa-onboarding.js';
const dadosSchema = z
  .object({
    nome: z.string().max(200).optional(),
    crm: z.string().max(40).optional(),
    rqe: z.string().max(12).nullable().optional(),
    periodo: z
      .object({
        quantidade: z.number().int().min(1).max(3650),
        unidade: z.enum(['dias', 'semanas', 'meses', 'anos'])
      })
      .strict()
      .optional(),
    dataCorte: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    preferencia: z
      .enum(['mesma_do_comprovante', 'perguntar_uma_a_uma'])
      .optional()
  })
  .strict();
export const decisaoAssistenteSchema = z
  .object({
    intencao: z.enum([
      'responder',
      'esclarecer',
      'registrar',
      'consultar',
      'pausar',
      'retomar'
    ]),
    ritmo: z.enum(['manter', 'pausar', 'retomar']),
    assunto: z.string().min(1).max(300),
    acoes: z
      .array(
        z
          .object({
            ferramenta: z.literal('registrar_dados'),
            dados: dadosSchema,
            evidencia: z.string().min(1).max(2000)
          })
          .strict()
      )
      .max(1)
  })
  .strict()
  .superRefine((d, c) => {
    if (d.acoes.length && d.intencao !== 'registrar')
      c.addIssue({ code: 'custom', message: 'Ação requer intenção registrar' });
  });
export type DecisaoAssistente = z.infer<typeof decisaoAssistenteSchema>;
export type EstadoContextual = EstadoAssistenteMedico & {
  pausado?: boolean;
  preferencia?: 'mesma_do_comprovante' | 'perguntar_uma_a_uma';
};
export interface ContextoDecisaoAssistente {
  estado: EstadoContextual;
  mensagemRecebida: string;
  historico: Array<{ papel: 'medico' | 'noto'; texto: string }>;
  panorama: Record<string, unknown>;
}
export interface DecisorAssistente {
  decidir(contexto: ContextoDecisaoAssistente): Promise<DecisaoAssistente>;
}
const normal = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
const pergunta = (s: string) =>
  /[?？]/.test(s) ||
  /^(?:por que|porque|como|qual|quais|o que|sera que|preciso mesmo)\b/.test(
    normal(s)
  );
const dataBrasilia = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
const numeros: Record<string, number> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12
};
export function validarAcoes(
  decisao: DecisaoAssistente,
  texto: string,
  estado: EstadoContextual,
  agora = new Date()
): {
  patch: Partial<EstadoContextual>;
  resultados: Array<{ campo: string; estado: string }>;
} {
  const patch: Partial<EstadoContextual> = {},
    resultados: Array<{ campo: string; estado: string }> = [];
  if (
    decisao.intencao !== 'registrar' ||
    pergunta(texto) ||
    /\b(talvez|hipotese|exemplo|colega|nome do paciente|crm do paciente|se eu|nao quero|nao usar|nao sei|nao lembro)\b/.test(
      normal(texto)
    )
  )
    return { patch, resultados };
  for (const a of decisao.acoes) {
    if (!normal(texto).includes(normal(a.evidencia))) {
      resultados.push({ campo: 'evidencia', estado: 'rejeitada' });
      continue;
    }
    const e = normal(a.evidencia),
      d = a.dados;
    const aplicar = (campo: string, valido: boolean, fn: () => void) => {
      resultados.push({ campo, estado: valido ? 'validado' : 'rejeitado' });
      if (valido) fn();
    };
    if (d.nome !== undefined)
      aplicar(
        'nome',
        nomeProfissionalValido(d.nome) && e.includes(normal(d.nome)),
        () => {
          patch.nomeConfirmado = d.nome!.trim().replace(/\s+/g, ' ');
        }
      );
    if (d.crm !== undefined) {
      const crm = normalizarCrm(d.crm),
        partes = crm?.split('/');
      const numerosTexto: string[] = e.match(/\d+/g) || [];
      aplicar(
        'crm',
        !!crm &&
          numerosTexto.includes(partes![0]) &&
          (!partes![1] || new RegExp('\\b' + partes![1] + '\\b', 'i').test(e)),
        () => {
          patch.crmInformado = crm!;
        }
      );
    }
    if (d.rqe !== undefined) {
      const valido =
        d.rqe === null
          ? (estado.etapa === 'aguardando_rqe_opcional' || /\brqe\b/.test(e)) &&
            /\b(nao|sem|pular|dispenso|prefiro nao)\b/.test(e)
          : /^\d{1,12}$/.test(d.rqe) &&
            /[1-9]/.test(d.rqe) &&
            Array.from(e.matchAll(/\d+/g), (m) => m[0]).includes(d.rqe);
      aplicar('rqe', valido, () => {
        patch.rqeInformado = d.rqe;
      });
    }
    if (d.periodo) {
      const m = e.match(
        /\b(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)\s+(dias?|semanas?|mes|meses|anos?)\b/
      );
      const n = m ? (numeros[m[1]] ?? Number(m[1])) : 0;
      const unidade = m?.[2].startsWith('mes')
        ? 'meses'
        : m?.[2].startsWith('semana')
          ? 'semanas'
          : m?.[2].startsWith('ano')
            ? 'anos'
            : 'dias';
      aplicar(
        'periodo',
        n === d.periodo.quantidade && unidade === d.periodo.unidade,
        () => {
          const dt = new Date(dataBrasilia(agora) + 'T12:00:00Z');
          const { quantidade: q, unidade: u } = d.periodo!;
          if (u === 'meses' || u === 'anos') {
            const dia = dt.getUTCDate();
            dt.setUTCDate(1);
            dt.setUTCMonth(dt.getUTCMonth() - q * (u === 'anos' ? 12 : 1));
            const fim = new Date(
              Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)
            ).getUTCDate();
            dt.setUTCDate(Math.min(dia, fim));
          } else dt.setUTCDate(dt.getUTCDate() - q * (u === 'semanas' ? 7 : 1));
          patch.janelaDataCorte = dt.toISOString().slice(0, 10);
        }
      );
    }
    if (d.dataCorte) {
      const iso = d.dataCorte;
      const [ano, mes, dia] = iso.split('-');
      const date = new Date(iso + 'T12:00:00Z');
      aplicar(
        'dataCorte',
        !Number.isNaN(date.getTime()) &&
          date.toISOString().slice(0, 10) === iso &&
          iso <= dataBrasilia(agora) &&
          (e.includes(iso) || e.includes(`${dia}/${mes}/${ano}`)),
        () => {
          patch.janelaDataCorte = iso;
        }
      );
    }
    if (d.preferencia) {
      const valido =
        d.preferencia === 'mesma_do_comprovante'
          ? /\b(comprovante|pagamento|mesma)\b/.test(e)
          : /\b(pergunt|confirm|paciente)/.test(e);
      aplicar('preferencia', valido, () => {
        patch.preferencia = d.preferencia;
      });
    }
  }
  return { patch, resultados };
}
export function proximaEtapa(e: EstadoContextual): EstadoContextual['etapa'] {
  if (!nomeProfissionalValido(e.nomeConfirmado)) return 'apresentacao';
  if (!normalizarCrm(e.crmInformado)) return 'aguardando_crm';
  if (e.rqeInformado === undefined) return 'aguardando_rqe_opcional';
  if (!e.janelaDataCorte) return 'aguardando_janela_tempo';
  if (!e.preferencia) return 'perguntar_preferencia_data';
  return 'concluido';
}
