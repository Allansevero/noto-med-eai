/**
 * Cliente de extração semântica de pedidos de emissão via Google Gemini (REST).
 * Analisa a mensagem do médico para identificar intenção de emitir nota, nome do paciente,
 * expressões de data e valores monetários usando responseSchema (JSON estrito).
 */

import { z } from 'zod';
import type { DadosExtraidosPedido } from '../tipos.js';

export const MODELO_PADRAO_GEMINI = 'gemini-2.5-flash';
export const URL_BASE_GEMINI = 'https://generativelanguage.googleapis.com/v1beta/models';

const schemaRespostaGeminiPedido = z.object({
  ehPedidoNota: z.boolean(),
  nomePaciente: z.string().trim().min(2).max(150).optional(),
  dataConsultaTexto: z.string().trim().max(50).optional(),
  valor: z.number().finite().positive().optional(),
  confianca: z.number().min(0).max(1).optional()
}).passthrough();

const PROMPT_SISTEMA_PEDIDO = `Você é um assistente especializado em interpretar pedidos de médicos para emissão de Notas Fiscais de Serviços (NFS-e).
Identifique se a mensagem do médico é uma instrução para gerar ou emitir uma nota fiscal ou recibo para um paciente.
Exemplos de intenção positiva:
- "emite a nota do Antônio Marques" -> ehPedidoNota: true, nomePaciente: "Antônio Marques"
- "gera nf do João Silva, consulta de ontem, 400 reais" -> ehPedidoNota: true, nomePaciente: "João Silva", dataConsultaTexto: "ontem", valor: 400.00
- "nota fiscal para Carlos Andrade dia 10" -> ehPedidoNota: true, nomePaciente: "Carlos Andrade", dataConsultaTexto: "dia 10"
- "manda a nota da Maria" -> ehPedidoNota: true, nomePaciente: "Maria"

Se a mensagem for apenas uma saudação, dúvida comum ou resposta genérica, retorne ehPedidoNota: false.`;

export class GeminiPedidoClient {
  constructor(
    private readonly apiKey: string,
    private readonly modelo: string = MODELO_PADRAO_GEMINI,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async extrairIntencaoPedido(texto: string, timeoutMs: number = 15_000): Promise<DadosExtraidosPedido> {
    if (!this.apiKey || !texto || !texto.trim()) {
      return { ehPedidoNota: false };
    }

    const url = `${URL_BASE_GEMINI}/${this.modelo}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: PROMPT_SISTEMA_PEDIDO },
            { text: `Mensagem do médico: "${texto.trim()}"` }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: {
            ehPedidoNota: { type: 'BOOLEAN' },
            nomePaciente: { type: 'STRING' },
            dataConsultaTexto: { type: 'STRING' },
            valor: { type: 'NUMBER' },
            confianca: { type: 'NUMBER' }
          },
          required: ['ehPedidoNota']
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
        signal: AbortSignal.timeout(timeoutMs)
      });

      if (!resp.ok) {
        console.warn(`[GeminiPedidoClient] Erro HTTP ${resp.status}`);
        return { ehPedidoNota: false };
      }

      const jsonResposta: any = await resp.json();
      const conteudoTexto = jsonResposta?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!conteudoTexto) return { ehPedidoNota: false };

      const parseado = JSON.parse(conteudoTexto);
      const validado = schemaRespostaGeminiPedido.safeParse(parseado);
      if (!validado.success) return { ehPedidoNota: false };

      const d = validado.data;
      const valorCentavos = d.valor !== undefined ? Math.round(d.valor * 100) : undefined;

      return {
        ehPedidoNota: d.ehPedidoNota,
        nomePaciente: d.nomePaciente,
        dataConsultaTexto: d.dataConsultaTexto,
        valorCentavos,
        confianca: d.confianca
      };
    } catch (err: any) {
      console.warn('[GeminiPedidoClient] Falha ao extrair intenção do pedido:', err?.message || err);
      return { ehPedidoNota: false };
    }
  }
}
