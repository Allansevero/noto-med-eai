import { LIMITE_MENSAGENS_CONTEXTO_MEDICO } from './regras/decidir-proxima-acao.js';

/** Sete dígitos contíguos já são identificadores longos; anos e datas ISO permanecem legíveis. */
export function sanitizarTextoMedico(texto: string): string {
  return texto
    .replace(/\b(?:senha|password|token|api[_ -]?key|secret|segredo)["']?\s*[:=]\s*[^\r\n;]+/gi, '[OCULTO]')
    .replace(/\bBearer\s+\S+/gi, '[OCULTO]')
    .replace(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu, '[OCULTO]')
    .replace(/\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}\b/g, '[OCULTO]')
    .replace(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g, '[OCULTO]')
    .replace(/(?<!\d)(?:\+\d{1,3}[\s.-]*)?(?:\(?\d{2,3}\)?[\s.-]*)?\d{4,5}[\s.-]\d{4}(?!\d)/g, '[OCULTO]')
    .replace(/\d{7,}/g, '[OCULTO]');
}

/** Só RAM: sem repositório, arquivo ou logger. Uma instância nova começa vazia. */
export class MemoriaConversaMedico {
  private readonly conversas = new Map<string, Array<{ id: string; texto: string }>>();

  ler(medicoId: string, conversa: string): string[] {
    return (this.conversas.get(JSON.stringify([medicoId, conversa])) ?? []).map(mensagem => mensagem.texto);
  }

  registrar(medicoId: string, conversa: string, id: string, texto: string): void {
    const chave = JSON.stringify([medicoId, conversa]);
    const mensagens = this.conversas.get(chave) ?? [];
    if (mensagens.some(mensagem => mensagem.id === id)) return;
    this.conversas.set(chave, [...mensagens, { id, texto: sanitizarTextoMedico(texto) }].slice(-LIMITE_MENSAGENS_CONTEXTO_MEDICO));
  }
}
