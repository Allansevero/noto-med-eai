/** Uma fronteira NVIDIA: nunca propaga corpos do provedor ou segue redirects. */
export class ErroNvidiaChat extends Error {
  constructor(public readonly codigo: string, public readonly statusHttp?: number) {
    super('A resposta da NVIDIA não foi concluída.');
  }
}
export type MensagemNvidia = { role: 'system' | 'user'; content: unknown };

export async function completarNvidia(
  apiKey: string, model: string, messages: MensagemNvidia[], timeoutMs = 90_000
): Promise<string> {
  if (!apiKey.trim()) throw new ErroNvidiaChat('IA_NAO_CONFIGURADA');
  let response: Response | undefined;
  const tentativasMax = 2;
  for (let tentativa = 1; tentativa <= tentativasMax; tentativa++) {
    try {
      response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ model, stream: false, temperature: 1, max_tokens: 4096,
          chat_template_kwargs: { thinking: false }, messages })
      });
      break;
    } catch {
      if (tentativa === tentativasMax) throw new ErroNvidiaChat('IA_CONEXAO_FALHOU');
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (!response || !response.ok) {
    if (response) await response.body?.cancel().catch(() => {});
    throw new ErroNvidiaChat('IA_HTTP_ERRO', response?.status);
  }
  try {
    const data = await response.json() as { choices?: Array<{ finish_reason?: string; message?: { content?: unknown } }> };
    const choice = data.choices?.[0];
    if (choice?.finish_reason && choice.finish_reason !== 'stop') throw Error('incompleta');
    const content = choice?.message?.content;
    if (typeof content !== 'string' || !content.trim() || content.length > 32_768) throw Error('conteudo');
    return content;
  } catch { throw new ErroNvidiaChat('IA_RESPOSTA_INVALIDA', response.status); }
}
