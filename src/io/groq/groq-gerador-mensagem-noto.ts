import { limites, carregarGuia } from '../../conversa/prompt-noto.js';
import { z } from 'zod';
import type { ContextoMensagemNoto, GeradorMensagemNoto } from '../../conversa/comunicador-noto.js';

const respostaSchema = z.object({
  mensagens: z.array(z.string().trim().min(1).max(500)).min(1).max(3)
}).strict();

/** Fronteira de comunicação: a IA recebe fatos e devolve apenas texto validado. */
export class GroqGeradorMensagemNoto implements GeradorMensagemNoto {
  constructor(private readonly apiKey: string, private readonly modelo: string) {}

  async gerar(contexto: ContextoMensagemNoto): Promise<string[]> {
    if (!this.apiKey.trim()) throw new Error('Gerador de mensagens do Noto não configurado');
    try {
      const guia = await carregarGuia();
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(10000),
        body: JSON.stringify({
          model: this.modelo,
          temperature: 0.6,
          max_completion_tokens: 900,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: `${guia}\n${limites}` },
            { role: 'user', content: JSON.stringify(contexto) }
          ]
        })
      });
      if (!response.ok) throw new Error('Resposta indisponível');
      const data = await response.json() as { choices?: Array<{ message?: { content?: unknown } }> };
      const conteudo = data?.choices?.[0]?.message?.content;
      if (typeof conteudo !== 'string') throw new Error('Resposta ausente');
      return respostaSchema.parse(JSON.parse(conteudo)).mensagens;
    } catch {
      // Não carregue corpos do provedor, tokens ou erros de validação para logs/usuários.
      throw new Error('Não foi possível gerar a mensagem do Noto');
    }
  }
}
