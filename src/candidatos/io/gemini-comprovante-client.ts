/**
 * Cliente de visão e leitura de documentos multimodal da Google (Gemini API).
 * Processa imagens e PDFs via schema estrito JSON (responseSchema) para identificar
 * comprovantes bancários, extrair CPF/Nome de DANFSe anteriores e resolver datas ambíguas.
 */

import { z } from 'zod';
import { validarCpf } from '../../paciente/validar-cpf.js';
import type { DadosComprovanteExtraidos, TipoPagamentoComprovante } from '../tipos.js';

export const MODELO_PADRAO_GEMINI = 'gemini-2.5-flash';
export const URL_BASE_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';

const schemaRespostaGemini = z.object({
  ehComprovante: z.boolean(),
  ehNotaFiscal: z.boolean().optional().default(false),
  tipo: z.enum(['pix', 'ted', 'transferencia', 'cartao', 'boleto', 'outro']).optional(),
  valor: z.number().finite().positive().optional(),
  dataPagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dataConsultaReferencia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  idTransacao: z.string().trim().min(1).max(150).optional(),
  pagadorNome: z.string().trim().min(1).max(200).optional(),
  pagadorCpf: z.string().trim().min(1).max(30).optional(),
  favorecidoNome: z.string().trim().min(1).max(200).optional(),
  tomadorNome: z.string().trim().min(1).max(200).optional(),
  tomadorCpf: z.string().trim().min(1).max(30).optional()
}).passthrough();

const schemaDataConsultaGemini = z.object({
  encontrouDataConsulta: z.boolean(),
  dataConsultaIso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
});

const PROMPT_SISTEMA_COMPROVANTE = `Analise detalhadamente a imagem ou documento PDF fornecido.
Identifique se o documento é:
1. Um comprovante de pagamento bancário (PIX, TED, transferência, cartão ou boleto liquidado).
2. Uma Nota Fiscal de Serviços (NFS-e / DANFSe / NF-e).
3. Documento de identificação ou ficha cadastral contendo CPF do paciente.

Extraia com exatidão:
- valor numérico em reais (ex: 350.00)
- dataPagamento (YYYY-MM-DD)
- dataConsultaReferencia (YYYY-MM-DD) se o texto/discriminação mencionar a data da consulta realizada
- idTransacao (código/autenticação/ID fim-a-fim PIX)
- pagadorNome e pagadorCpf (11 dígitos completos se não estiver mascarado com asteriscos)
- favorecidoNome
- Se for Nota Fiscal (ehNotaFiscal = true), extraia obrigatoriamente tomadorNome e tomadorCpf (11 dígitos do CPF do Tomador do Serviço).`;

export class GeminiComprovanteClient {
  constructor(
    private readonly apiKey: string,
    private readonly modelo: string = MODELO_PADRAO_GEMINI,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async analisarMidia(params: {
    base64: string;
    mimeType?: string;
    timeoutMs?: number;
  }): Promise<DadosComprovanteExtraidos> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      console.warn('[GeminiComprovanteClient] Chave de API do Gemini não configurada');
      return { ehComprovante: false };
    }

    const b64Limpo = params.base64.replace(/^data:[^;]+;base64,/, '').trim();
    if (!b64Limpo) return { ehComprovante: false };

    const payload = montarPayloadMidia(b64Limpo, params.mimeType || 'image/jpeg');
    const parseado = await this.executarChamadaJson(payload, params.timeoutMs || 30_000);
    if (!parseado) return { ehComprovante: false };

    const validado = schemaRespostaGemini.safeParse(parseado);
    if (!validado.success) return { ehComprovante: false };

    return mapearDadosExtraidos(validado.data);
  }

  async inferirDataConsultaConversa(params: {
    mensagens: Array<{ direcao: 'enviada' | 'recebida'; texto: string; criadoEmIso: string }>;
    dataPagamentoIso: string;
    timeoutMs?: number;
  }): Promise<{ dataConsultaIso: string; dataConsultaBr: string } | null> {
    if (!this.apiKey?.trim() || params.mensagens.length === 0) return null;

    const linhas = params.mensagens
      .slice(-15)
      .map(m => `[${m.criadoEmIso}] ${m.direcao === 'enviada' ? 'Clínica' : 'Paciente'}: ${m.texto}`)
      .join('\n');

    const prompt = `Analise o histórico de mensagens abaixo entre Clínica e Paciente antes do pagamento realizado em ${params.dataPagamentoIso}.
Determine a data exata (YYYY-MM-DD) em que a consulta/atendimento correspondente a esse pagamento foi agendada ou realizada.
Resolva termos como "hoje", "ontem", "amanhã" ou dias da semana usando o timestamp [YYYY-MM-DD...] da própria mensagem onde o termo foi dito.
Histórico:
${linhas}`;

    const payload = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            encontrouDataConsulta: { type: 'BOOLEAN' },
            dataConsultaIso: { type: 'STRING' }
          },
          required: ['encontrouDataConsulta']
        }
      }
    };

    const parseado = await this.executarChamadaJson(payload, params.timeoutMs || 15_000);
    const validado = schemaDataConsultaGemini.safeParse(parseado);
    if (!validado.success || !validado.data.encontrouDataConsulta || !validado.data.dataConsultaIso) {
      return null;
    }

    const iso = validado.data.dataConsultaIso;
    const [ano, mes, dia] = iso.split('-');
    return { dataConsultaIso: iso, dataConsultaBr: `${dia}/${mes}/${ano}` };
  }

  private async executarChamadaJson(payload: unknown, timeoutMs: number): Promise<unknown | null> {
    const url = `${URL_BASE_GEMINI}/${this.modelo}:generateContent?key=${encodeURIComponent(this.apiKey)}`;
    try {
      const resp = await this.fetchFn(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!resp.ok) {
        const textoErro = await resp.text().catch(() => '');
        console.warn(`[GeminiComprovanteClient] Erro HTTP ${resp.status}:`, textoErro);
        return null;
      }

      const jsonResposta: any = await resp.json();
      const conteudoTexto = jsonResposta?.candidates?.[0]?.content?.parts?.[0]?.text;
      return conteudoTexto ? JSON.parse(conteudoTexto) : null;
    } catch (err: any) {
      console.warn('[GeminiComprovanteClient] Falha na chamada Gemini:', err?.message || err);
      return null;
    }
  }
}

function montarPayloadMidia(b64Limpo: string, mime: string) {
  return {
    contents: [
      {
        role: 'user',
        parts: [
          { text: PROMPT_SISTEMA_COMPROVANTE },
          { inlineData: { mimeType: mime, data: b64Limpo } }
        ]
      }
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          ehComprovante: { type: 'BOOLEAN' },
          ehNotaFiscal: { type: 'BOOLEAN' },
          tipo: {
            type: 'STRING',
            enum: ['pix', 'ted', 'transferencia', 'cartao', 'boleto', 'outro']
          },
          valor: { type: 'NUMBER' },
          dataPagamento: { type: 'STRING' },
          dataConsultaReferencia: { type: 'STRING' },
          idTransacao: { type: 'STRING' },
          pagadorNome: { type: 'STRING' },
          pagadorCpf: { type: 'STRING' },
          favorecidoNome: { type: 'STRING' },
          tomadorNome: { type: 'STRING' },
          tomadorCpf: { type: 'STRING' }
        },
        required: ['ehComprovante', 'ehNotaFiscal']
      }
    }
  };
}

function mapearDadosExtraidos(d: z.infer<typeof schemaRespostaGemini>): DadosComprovanteExtraidos {
  const valorCentavos = d.valor !== undefined ? Math.round(d.valor * 100) : undefined;
  const pagadorCpf = sanitizarCpfValido(d.pagadorCpf);
  const tomadorCpf = sanitizarCpfValido(d.tomadorCpf);

  return {
    ehComprovante: d.ehComprovante,
    ehNotaFiscal: d.ehNotaFiscal,
    tipo: d.tipo as TipoPagamentoComprovante | undefined,
    valorCentavos,
    valorFormatado: d.valor !== undefined ? d.valor.toFixed(2) : undefined,
    dataPagamento: d.dataPagamento,
    dataConsultaReferencia: d.dataConsultaReferencia,
    idTransacao: d.idTransacao,
    pagadorNome: d.pagadorNome,
    pagadorCpf,
    favorecidoNome: d.favorecidoNome,
    tomadorNome: d.tomadorNome,
    tomadorCpf
  };
}

function sanitizarCpfValido(cpfBruto?: string): string | undefined {
  if (!cpfBruto) return undefined;
  const digitos = cpfBruto.replace(/\D/g, '');
  if (digitos.length !== 11 || !validarCpf(digitos)) return undefined;
  return digitos;
}

