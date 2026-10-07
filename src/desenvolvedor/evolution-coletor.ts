import { configurarSincronizacaoHistorico } from '../onboarding/io/configurar-sincronizacao-historico.js';
import { extrairPaginaMensagens } from '../onboarding/io/sincronizar-historico-evolution.js';
import type { DadosMensagemEvolution } from '../whatsapp/payload-webhook-schema.js';
export interface EvolutionColetor {
  criar(nome: string): Promise<void>;
  estado(nome: string): Promise<string>;
  qrcode(nome: string): Promise<string | null>;
  pagina(nome: string, pagina: number): Promise<{ mensagens: DadosMensagemEvolution[]; registros: number; invalidos: number; totalPaginas: number | null }>;
  remover(nome: string): Promise<void>;
}
/** Instâncias exclusivas do coletor. Não cadastra médicos e não configura webhooks de emissão. */
export class EvolutionColetorClient implements EvolutionColetor {
  constructor(private url: string, private chave: string) {}
  private async api(caminho: string, method = 'GET', body?: unknown, aceitaAusente = false) {
    const res = await fetch(this.url.replace(/\/+$/, '') + caminho, { method,
      headers: { apikey: this.chave, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000) });
    if (aceitaAusente && res.status === 404) return {};
    if (!res.ok) throw new Error(`Evolution indisponível (HTTP ${res.status}).`);
    const texto = await res.text();
    if (texto.length > 5 * 1024 * 1024) throw new Error('Resposta do histórico excede o limite de leitura.');
    if (!texto) return {};
    return JSON.parse(texto);
  }
  private caminho(nome: string) {
    if (!/^noto_dev_coletor_[0-9a-f]{32}$/.test(nome)) throw new Error('Instância de teste inválida.');
    return encodeURIComponent(nome);
  }
  async criar(nome: string) {
    this.caminho(nome);
    await this.api('/instance/create', 'POST', { instanceName: nome, integration: 'WHATSAPP-BAILEYS', qrcode: false,
      syncFullHistory: true, webhook: { enabled: false }, readMessages: false, readStatus: false, groupsIgnore: true, alwaysOnline: false });
    if (!await configurarSincronizacaoHistorico({baseUrl:this.url.replace(/\/+$/, ''),apiKey:this.chave,nomeInstancia:nome})) throw new Error('Não foi possível ativar o histórico.');
    // Desativa explicitamente o webhook local antes de permitir o pareamento.
    await this.api('/webhook/set/' + this.caminho(nome), 'POST', { webhook: { enabled: false, url: '', events: [] } });
  }
  async estado(nome: string) { const d = await this.api('/instance/connectionState/' + this.caminho(nome)); return d?.instance?.state || 'unknown'; }
  async qrcode(nome: string) {
    const d = await this.api('/instance/connect/' + this.caminho(nome));
    const valor = d.base64 || d.qrcode?.base64;
    if (typeof valor !== 'string') return null;
    const base64 = valor.replace(/^data:image\/png;base64,/, '');
    return /^[A-Za-z0-9+/=]+$/.test(base64) && base64.length < 1024 * 1024 ? 'data:image/png;base64,' + base64 : null;
  }
  async pagina(nome: string, pagina: number) {
    const d = await this.api('/chat/findMessages/' + this.caminho(nome), 'POST', { page: pagina, offset: 100 });
    const registros = Array.isArray(d.messages?.records) ? d.messages.records : Array.isArray(d.messages) ? d.messages : Array.isArray(d.records) ? d.records : [];
    const informado = Number(d.messages?.pages ?? d.pages);
    const extraida = extrairPaginaMensagens(d);
    return { mensagens: extraida.mensagens, registros: registros.length, invalidos: registros.length - extraida.mensagens.length,
      totalPaginas: Number.isInteger(informado) && informado > 0 ? informado : null };
  }
  async remover(nome: string) { await this.api('/instance/delete/' + this.caminho(nome), 'DELETE', undefined, true); }
}
