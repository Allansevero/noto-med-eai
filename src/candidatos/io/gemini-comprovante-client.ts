/**
 * Cliente de visão e leitura de documentos multimodal da Google (Gemini API).
 * Processa imagens e PDFs via schema estrito JSON (responseSchema) para identificar
 * comprovantes bancários e extrair metadados financeiros sem texto livre ou tool-calling.
 */

import { z } from 'zod';
import type { DadosComprovanteExtraidos, TipoPagamentoComprovante } from '../tipos.js';

export const MODELO_PADRAO_GEMINI = 'gemini-2.5-flash';
export const URL_BASE_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';

const schemaRespostaGemini = z.object({
  ehComprovante: z.boolean(),
  ehNotaFiscal: z.boolean().optional().default(false),
  tipo: z.enum(['pix', 'ted', 'transferencia', 'cartao', 'boleto', 'outro']).optional(),
  valor: z.number().finite().positive().optional(),
  dataPagamento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  idTransacao: z.string().trim().min(1).max(150).optional(),
  pagadorNome: z.string().trim().min(1).max(200).optional(),
  favorecidoNome: z.string().trim().min(1).max(200).optional()
}).passthrough();

const PROMPT_SISTEMA_COMPROVANTE = `Analise detalhadamente a imagem ou documento PDF fornecido.
Identifique se o documento é:
1. Um comprovante de pagamento bancário (PIX, TED, transferência, cartão ou boleto liquidado).
2. Uma Nota Fiscal de Serviços (NFS-e / DANFSe / NF-e).
3. Qualquer outro documento (exame, receita, foto comum).

Extraia com exatidão o valor numérico em reais (ex: 350.00), a data de pagamento (YYYY-MM-DD), o nome do pagador, o nome do favorecido e o código/autenticação/ID de transação PIX fim-a-fim quando legíveis.`;

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

    const mime = params.mimeType || 'image/jpeg';
    const url = `${URL_BASE_GEMINI}/${this.modelo}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: PROMPT_SISTEMA_COMPROVANTE },
            {
              inlineData: {
                mimeType: mime,
                data: b64Limpo
              }
            }
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
            idTransacao: { type: 'STRING' },
            pagadorNome: { type: 'STRING' },
            favorecidoNome: { type: 'STRING' }
          },
          required: ['ehComprovante', 'ehNotaFiscal']
        }
      }
    };

    try {
      const resp = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(params.timeoutMs || 30_000)
      });

      if (!resp.ok) {
        const textoErro = await resp.text().catch(() => '');
        console.warn(`[GeminiComprovanteClient] Erro HTTP ${resp.status}:`, textoErro);
        return { ehComprovante: false };
      }

      const jsonResposta: any = await resp.json();
      const conteudoTexto = jsonResposta?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!conteudoTexto) return { ehComprovante: false };

      const parseado = JSON.parse(conteudoTexto);
      const validado = schemaRespostaGemini.safeParse(parseado);
      if (!validado.success) return { ehComprovante: false };

      const d = validado.data;
      const valorCentavos = d.valor !== undefined ? Math.round(d.valor * 100) : undefined;

      return {
        ehComprovante: d.ehComprovante,
        ehNotaFiscal: d.ehNotaFiscal,
        tipo: d.tipo as TipoPagamentoComprovante | undefined,
        valorCentavos,
        valorFormatado: d.valor !== undefined ? d.valor.toFixed(2) : undefined,
        dataPagamento: d.dataPagamento,
        idTransacao: d.idTransacao,
        pagadorNome: d.pagadorNome,
        favorecidoNome: d.favorecidoNome
      };
    } catch (err: any) {
      console.warn('[GeminiComprovanteClient] Falha ao analisar mídia:', err?.message || err);
      return { ehComprovante: false };
    }
  }
}
