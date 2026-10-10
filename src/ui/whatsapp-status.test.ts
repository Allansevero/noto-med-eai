import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
function tela() {
  const nodes = new Map<string, any>();
  const node = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, { textContent: '', disabled: false, hidden: false, handlers: {},
      classList: { toggle() {} }, addEventListener(e: string, h: any) { this.handlers[e] = h; } });
    return nodes.get(id);
  };
  const pedidos: any[] = [], timers = new Map<number, any>(), passos: number[] = [];
  let resposta: any = { ok: true, conectado: true }, contador = 0;
  const c = vm.createContext({ sessaoAtual: { tokenAcesso: 'jwt-teste', usuario: { medicoId: 'med-1' } },
    painelDisponivel: true, whatsappJaVinculado: true, document: { hidden: false, getElementById: node, addEventListener() {} },
    window: { addEventListener() {} }, AbortSignal,
    mostrarPasso(passo: number) { passos.push(passo); },
    setInterval(fn: any) { timers.set(++contador, fn); return contador; }, clearInterval(id: number) { timers.delete(id); },
    async fetch(url: string, init: any) { pedidos.push({ url, init }); return { ok: true, json: async () => resposta }; } });
  const trecho = html.match(/\/\/ INICIO STATUS WHATSAPP([\s\S]*?)\/\/ FIM STATUS WHATSAPP/)?.[1];
  assert.ok(trecho, 'O painel precisa mostrar o estado atual do WhatsApp'); vm.runInContext(trecho, c);
  return { c, node, pedidos, timers, passos, responder(data: any) { resposta = data; } };
}
test('card passa de conectado para desconectado ao atualizar e permite reconectar', async () => {
  const f = tela(); await vm.runInContext('iniciarStatusWhatsappPainel()', f.c);
  assert.equal(f.node('btnWhatsappPainel').textContent, 'Conectado');
  assert.equal(f.node('btnWhatsappPainel').disabled, true);
  assert.equal(f.pedidos[0].url, '/api/whatsapp/status');
  assert.equal(f.pedidos[0].init.headers.Authorization, 'Bearer jwt-teste');
  f.responder({ ok: true, conectado: false }); await [...f.timers.values()][0]();
  assert.equal(f.node('btnWhatsappPainel').textContent, 'Conectar');
  assert.equal(f.node('btnWhatsappPainel').disabled, false);
  assert.match(f.node('whatsappPainelStatus').textContent, /desconectado/i);
  f.node('btnWhatsappPainel').handlers.click(); assert.deepEqual(f.passos, [4]);
});
test('falha de consulta não mantém indicação falsa de conectado nem expõe erro', async () => {
  const f = tela(); await vm.runInContext('iniciarStatusWhatsappPainel()', f.c);
  f.c.fetch = async () => { throw Error('segredo-do-provedor'); };
  await [...f.timers.values()][0]();
  assert.equal(f.node('btnWhatsappPainel').textContent, 'Conectar');
  assert.match(f.node('whatsappPainelStatus').textContent, /Não foi possível verificar/);
  assert.doesNotMatch(f.node('whatsappPainelStatus').textContent, /segredo/);
});
test('fechar painel descarta resposta atrasada e encerra atualização periódica', async () => {
  const f = tela(); let devolver!: (value: any) => void;
  f.c.fetch = () => new Promise(r => { devolver = r; });
  const atualizacao = vm.runInContext('iniciarStatusWhatsappPainel()', f.c);
  vm.runInContext('pararStatusWhatsappPainel(); sessaoAtual = null', f.c);
  devolver({ ok: true, json: async () => ({ ok: true, conectado: true }) }); await atualizacao;
  assert.equal(f.timers.size, 0); assert.notEqual(f.node('btnWhatsappPainel').textContent, 'Conectado');
});
