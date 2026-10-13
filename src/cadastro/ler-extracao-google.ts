/**
 * Separa o formato da resposta do modelo da validação de evidência profissional.
 * Diagnósticos são estáticos: nunca incluem conteúdo ou credenciais do provedor.
 */
type ExtracaoGoogle =
  | { ok: true; registros: unknown[] }
  | { ok: false; codigo: 'NVIDIA_JSON_INVALIDO' | 'NVIDIA_FORMATO_INESPERADO' | 'NVIDIA_LIMITE_EXCEDIDO' };

export function lerExtracaoGoogle(resposta: string): ExtracaoGoogle {
  if (resposta.length > 32_768) return { ok: false, codigo: 'NVIDIA_LIMITE_EXCEDIDO' };
  const texto = resposta.trim();
  // Remove somente um bloco que envolve a resposta inteira, sem extrair JSON de prosa.
  const bloco = /^```(?:json)?\s*\n([\s\S]*?)\n```$/i.exec(texto);
  let json: unknown;
  try { json = JSON.parse(bloco ? bloco[1].trim() : texto); }
  catch { return { ok: false, codigo: 'NVIDIA_JSON_INVALIDO' }; }
  if (!json || typeof json !== 'object' || Array.isArray(json) || !Array.isArray((json as { registros?: unknown }).registros)) {
    return { ok: false, codigo: 'NVIDIA_FORMATO_INESPERADO' };
  }
  const registros = (json as { registros: unknown[] }).registros;
  if (registros.length > 20) return { ok: false, codigo: 'NVIDIA_LIMITE_EXCEDIDO' };
  return { ok: true, registros };
}
