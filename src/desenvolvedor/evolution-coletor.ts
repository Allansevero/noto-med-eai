import { extrairPaginaMensagens } from '../onboarding/io/sincronizar-historico-evolution.js';
import type { DadosMensagemEvolution } from '../whatsapp/payload-webhook-schema.js';
export interface EvolutionColetor {
  criar(nome: string): Promise<void>;
  estado(nome: string): Promise<string>;
  qrcode(nome: string): Promise<string | null>;
  pagina(nome: string, pagina: number): Promise<{ mensagens: DadosMensagemEvolution[]; registros: number; invalidos: number; totalPaginas: number | null }>;
  remover(nome: string): Promise<void>;
}
export class ErroEvolutionColetor extends Error {
  constructor(public etapa: string, public codigo: string, public statusHttp?: number) {
    super(`Falha na Evolution: ${etapa} (${codigo}${statusHttp ? ', HTTP '+statusHttp : ''}).`);
  }
}
/** Instâncias exclusivas do coletor. Não cadastra médicos e não configura webhooks de emissão. */
export class EvolutionColetorClient implements EvolutionColetor {
  constructor(private url: string, private chave: string) {}
  private async api(caminho: string, method = 'GET', body?: unknown, aceitaAusente = false) {
    const etapa = caminho.split('/').slice(1,3).join('/');
    try {
    const res = await fetch(this.url.replace(/\/+$/, '') + caminho, { method,
      headers: { apikey: this.chave, 'Content-Type': 'application/json' },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    if (aceitaAusente && res.status === 404) return {};
    if (!res.ok) throw new ErroEvolutionColetor(etapa,'HTTP_ERRO',res.status);
    const texto = await res.text();
    if (texto.length > 5 * 1024 * 1024) throw new ErroEvolutionColetor(etapa,'RESPOSTA_EXCESSIVA');
    if (!texto) return {};
    try {const d=JSON.parse(texto);if(!d||typeof d!=='object'||Array.isArray(d))throw new Error();return d;}
    catch {throw new ErroEvolutionColetor(etapa,'RESPOSTA_INVALIDA',res.status);}
    } catch(erro) {
      if(erro instanceof ErroEvolutionColetor)throw erro;
      const timeout=erro instanceof Error&&['TimeoutError','AbortError'].includes(erro.name);
      throw new ErroEvolutionColetor(etapa,timeout?'TEMPO_LIMITE':'FALHA_REDE');
    }
  }
  private caminho(nome: string) {
    if (!/^noto_dev_coletor_[0-9a-f]{32}$/.test(nome)) throw new Error('Instância de teste inválida.');
    return encodeURIComponent(nome);
  }
  async criar(nome: string) {
    this.caminho(nome);
    // A Evolution exige URL ao receber uma configuração de webhook, inclusive
    // desativada. O endereço local é apenas estrutural: enabled=false e events=[]
    // impedem envio. Nunca aponta para o webhook de emissão do Noto.
    const webhook = { enabled: false, url: 'http://127.0.0.1/noto-dev-coletor-desativado',
      events: [], byEvents: false, base64: false };
    await this.api('/instance/create', 'POST', { instanceName: nome, integration: 'WHATSAPP-BAILEYS', qrcode: false,
      syncFullHistory: true, webhook, readMessages: false, readStatus: false, groupsIgnore: true, alwaysOnline: false });
    // A instância é nova e exclusiva do teste: configura todos os campos exigidos,
    // com o mesmo limite de tempo das outras operações da integração.
    await this.api('/settings/set/' + this.caminho(nome),'POST',{rejectCall:false,msgCall:'',groupsIgnore:true,
      alwaysOnline:false,readMessages:false,readStatus:false,syncFullHistory:true});
    // Desativa explicitamente o webhook local antes de permitir o pareamento.
    await this.api('/webhook/set/' + this.caminho(nome), 'POST', { webhook });
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
