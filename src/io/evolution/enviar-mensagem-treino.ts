/**
 * Usa o botão de copiar já adotado no OTP. Só cai para texto quando o endpoint
 * rejeita explicitamente o formato; timeout/5xx podem ter enviado a mensagem.
 */
import type { MensagemTreino } from '../../onboarding/treino/mensagens-treino.js';
import type { ResultadoEnvioTreino } from '../../onboarding/treino/enviar-treino.js';

export interface ConfigEnvioTreino { baseUrl: string; apiKey: string; instanciaOficial: string }

export async function enviarMensagemTreino(
  config: ConfigEnvioTreino, telefone: string, mensagem: MensagemTreino
): Promise<ResultadoEnvioTreino> {
  const digitos = telefone.replace(/\D/g, '');
  const number = digitos.length === 10 || digitos.length === 11 ? `55${digitos}` : digitos;
  const botao = Boolean(mensagem.copiarTexto);
  const body = botao ? { number, title: 'Modelo para emitir sua nota', description: mensagem.texto,
    footer: 'Noto • Copie e preencha valor e data',
    buttons: [{ type: 'copy', displayText: 'Copiar mensagem', copyCode: mensagem.copiarTexto }] }
    : { number, text: mensagem.texto };
  try {
    const resp = await fetch(`${config.baseUrl.replace(/\/$/, '')}/message/${botao ? 'sendButtons' : 'sendText'}/${encodeURIComponent(config.instanciaOficial)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
      body: JSON.stringify(body), signal: AbortSignal.timeout(20_000)
    });
    if (botao && [400, 404, 405, 422].includes(resp.status)) {
      return enviarMensagemTreino(config, telefone, { texto: mensagem.texto });
    }
    if (!resp.ok) return { sucesso: false, incerto: resp.status >= 500 || resp.status === 408, motivo: `Evolution HTTP ${resp.status}` };
    const resposta = await resp.json().catch(() => null);
    return { sucesso: true, mensagemId: typeof resposta?.key?.id === 'string' ? resposta.key.id : undefined,
      formato: botao ? 'botao' : 'texto' };
  } catch {
    return { sucesso: false, incerto: true, motivo: 'Evolution sem confirmação de envio (rede ou timeout).' };
  }
}
