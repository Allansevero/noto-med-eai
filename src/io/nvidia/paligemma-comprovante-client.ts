/**
 * Cliente de visão computacional da NVIDIA (PaliGemma VLM).
 * Analisa imagens de mensagens do WhatsApp para identificar comprovantes
 * de pagamento (PIX, TED, transferências) e extrair metadados financeiros.
 */

import { z } from 'zod';

export const URL_PALIGEMMA_NVIDIA = 'https://ai.api.nvidia.com/v1/vlm/google/paligemma';
export const TOKEN_PADRAO_NVIDIA = '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';

export interface DadosComprovanteExtraidos {
  ehComprovante: boolean;
  valorCentavos?: number;
  valorFormatado?: string;
  dataPagamento?: string;
  pagadorNome?: string;
  favorecidoNome?: string;
  transacaoId?: string;
  tipo?: 'pix' | 'ted' | 'transferencia' | 'cartao' | 'outro';
}

const comprovanteSchema = z.object({
  ehComprovante: z.boolean(),
  valor: z.number().finite().positive().optional(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  pagador: z.string().trim().min(1).max(200).optional(),
  favorecido: z.string().trim().min(1).max(200).optional(),
  idTransacao: z.string().trim().min(1).max(100).optional(),
  tipo: z.enum(['pix', 'ted', 'transferencia', 'cartao', 'outro']).optional()
}).passthrough();

export const PROMPT_ANALISE_COMPROVANTE = `Analise detalhadamente a imagem fornecida.
Ela é um comprovante bancário ou recibo de pagamento (PIX, transferência bancária, TED ou cartão)?
Responda EXCLUSIVAMENTE um objeto JSON válido (sem texto adicional fora do JSON) com a estrutura:
{
  "ehComprovante": true ou false,
  "valor": número decimal (ex: 450.00),
  "data": "AAAA-MM-DD" da data do pagamento,
  "pagador": "Nome de quem pagou",
  "favorecido": "Nome de quem recebeu",
  "idTransacao": "identificador ou autenticação se visível",
  "tipo": "pix" | "ted" | "transferencia" | "cartao" | "outro"
}
Se a imagem NÃO for um comprovante de pagamento, responda apenas:
{"ehComprovante": false}`;

export function parsearRespostaComprovante(respostaBruta: string): DadosComprovanteExtraidos {
  if (!respostaBruta || !respostaBruta.trim()) {
    return { ehComprovante: false };
  }

  try {
    const limpo = respostaBruta
      .replace(/^```json\s*/im, '')
      .replace(/^```\s*/im, '')
      .replace(/```\s*$/im, '')
      .trim();

    const inicioJson = limpo.indexOf('{');
    const fimJson = limpo.lastIndexOf('}');
    if (inicioJson === -1 || fimJson === -1 || fimJson <= inicioJson) {
      // Se não houver JSON explícito, verifica se o modelo respondeu negativo
      if (/não|nao|not a receipt|not a payment/i.test(limpo)) {
        return { ehComprovante: false };
      }
      return { ehComprovante: false };
    }

    const jsonExtraido = JSON.parse(limpo.slice(inicioJson, fimJson + 1));
    const validado = comprovanteSchema.safeParse(jsonExtraido);
    if (!validado.success || !validado.data.ehComprovante) {
      return { ehComprovante: false };
    }

    const d = validado.data;
    const valorCentavos = d.valor !== undefined
      ? Math.round(d.valor * 100)
      : undefined;

    return {
      ehComprovante: true,
      valorCentavos,
      valorFormatado: d.valor !== undefined ? d.valor.toFixed(2) : undefined,
      dataPagamento: d.data,
      pagadorNome: d.pagador,
      favorecidoNome: d.favorecido,
      transacaoId: d.idTransacao,
      tipo: d.tipo
    };
  } catch {
    return { ehComprovante: false };
  }
}

export class PaligemmaComprovanteClient {
  constructor(
    private readonly apiKey: string = process.env.NVIDIA_API_KEY || TOKEN_PADRAO_NVIDIA,
    private readonly endpointUrl: string = URL_PALIGEMMA_NVIDIA,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  async analisarImagem(
    imagemBase64: string,
    mimeType: 'image/jpeg' | 'image/png' = 'image/jpeg',
    timeoutMs = 30_000
  ): Promise<DadosComprovanteExtraidos> {
    const b64Limpo = imagemBase64.replace(/^data:[^;]+;base64,/, '').trim();
    if (!b64Limpo) {
      return { ehComprovante: false };
    }

    if (b64Limpo.length > 250_000) {
      throw new Error('A imagem é muito grande para análise direta pelo VLM da NVIDIA.');
    }

    const payload = {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: PROMPT_ANALISE_COMPROVANTE
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${b64Limpo}`
              }
            }
          ]
        }
      ],
      max_tokens: 512,
      temperature: 0.20,
      top_p: 0.70,
      stream: false
    };

    const resposta = await this.fetchFn(this.endpointUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!resposta.ok) {
      throw new Error(`Falha na API PaliGemma NVIDIA (HTTP ${resposta.status})`);
    }

    const dados = await resposta.json() as any;
    const conteudoTexto = dados.choices?.[0]?.message?.content
      ?? (typeof dados === 'string' ? dados : JSON.stringify(dados));

    return parsearRespostaComprovante(String(conteudoTexto));
  }
}
