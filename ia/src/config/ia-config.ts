/**
 * Configurações do serviço de inteligência artificial isolado.
 * Centraliza variáveis de ambiente de portas, autenticação interna e chaves de IA (Gemini/NVIDIA).
 */

export interface IaConfig {
  porta: number;
  tokenInterno: string;
  geminiApiKey?: string;
  geminiModel: string;
  nvidiaApiKey?: string;
  nvidiaModel: string;
}

export function carregarIaConfig(env: NodeJS.ProcessEnv = process.env): IaConfig {
  return {
    porta: Number(env['PORT'] || env['IA_PORT'] || 3002),
    tokenInterno: env['INTERNAL_IA_TOKEN'] || env['IA_INTERNAL_SECRET'] || 'dev-ia-token-segredo',
    geminiApiKey: env['GEMINI_API_KEY'],
    geminiModel: env['GEMINI_MODEL'] || 'gemini-2.5-flash',
    nvidiaApiKey: env['NVIDIA_API_KEY'],
    nvidiaModel: env['NVIDIA_MODEL'] || 'meta/llama-3.2-3b-instruct'
  };
}
