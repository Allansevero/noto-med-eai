/**
 * Cliente HTTP para a API da Groq (provedor de inferência rápida de LLM).
 * Implementa a porta ExtratorIaService com suporte a timeout, cabeçalhos de autenticação
 * e failover automático entre modelos (openai/gpt-oss-120b e openai/gpt-oss-20b).
 */

import type { ExtratorIaService, DadosExtracaoIa } from '../../ia/extrator-ia-service.js';
import { montarPromptExtracao } from '../../ia/regras/montar-prompt-extracao.js';
import { parsearRespostaExtracao } from '../../ia/regras/parsear-resposta-extracao.js';

export interface GroqApiClientConfig {
  apiKey: string;
  modeloPrincipal?: string;
  modeloFallback?: string;
  timeoutMs?: number;
}

export class GroqApiClient implements ExtratorIaService {
  private readonly apiKey: string;
  private readonly modeloPrincipal: string;
  private readonly modeloFallback: string;
  private readonly timeoutMs: number;

  constructor(config: GroqApiClientConfig) {
    this.apiKey = config.apiKey;
    this.modeloPrincipal = config.modeloPrincipal || 'openai/gpt-oss-120b';
    this.modeloFallback = config.modeloFallback || 'openai/gpt-oss-20b';
    this.timeoutMs = config.timeoutMs || 6000;
  }

  async extrairDados(textoConversa: string, dataReferencia: Date = new Date()): Promise<DadosExtracaoIa> {
    if (!this.apiKey || !textoConversa.trim()) {
      return {};
    }

    const prompt = montarPromptExtracao(textoConversa, dataReferencia);

    try {
      const conteudo = await this.executarChamadaGroq(this.modeloPrincipal, prompt);
      return parsearRespostaExtracao(conteudo);
    } catch {
      // Tentativa de failover com modelo secundário caso o principal sofra rate limit ou indisponibilidade
      try {
        const conteudoFallback = await this.executarChamadaGroq(this.modeloFallback, prompt);
        return parsearRespostaExtracao(conteudoFallback);
      } catch {
        return {};
      }
    }
  }

  private async executarChamadaGroq(modelo: string, prompt: { system: string; user: string }): Promise<string> {
    const url = 'https://api.groq.com/openai/v1/chat/completions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: modelo,
        messages: [
          { role: 'system', content: prompt.system },
          { role: 'user', content: prompt.user }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1
      }),
      signal: AbortSignal.timeout(this.timeoutMs)
    });

    if (!response.ok) {
      const erroTexto = await response.text();
      throw new Error(`Groq HTTP ${response.status}: ${erroTexto}`);
    }

    const data: any = await response.json();
    return data?.choices?.[0]?.message?.content || '{}';
  }
}
