/** Handlers reais do cadastro; DOM, leitura de arquivo e HTTP são as fronteiras simuladas. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
function tela() {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const nodes = new Map<string, any>();
  function node(id: string, classes = '') {
    if (!nodes.has(id)) {
      const valores = new Set(classes.split(' ').filter(Boolean));
      nodes.set(id, { value: '', textContent: '', disabled: false, handlers: {} as any, dataset: {}, style: {},
        classList: { add(...c: string[]) { c.forEach(v => valores.add(v)); }, remove(...c: string[]) { c.forEach(v => valores.delete(v)); },
          contains(c: string) { return valores.has(c); }, toggle(c: string, ativo = !valores.has(c)) { ativo ? valores.add(c) : valores.delete(c); } },
        addEventListener(e: string, h: any) { this.handlers[e] = h; }, setAttribute() {}, focus() {}, querySelector() { return null; } });
    }
    return nodes.get(id);
  }
  for (const tag of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) node(tag[1], tag[0].match(/\bclass="([^"]*)"/)?.[1]);
  const otp = Array.from({ length: 6 }, (_, i) => node('otp' + i));
  const tabs = ['Painel', 'Emissoes', 'Conta'].map((n, i) => { const el = node('tabBtn' + n); el.dataset.tab = ['painel', 'emissoes', 'conta'][i]; return el; });
  let leitor: any;
  class FileReader {
    onload: any; onerror: any;
    readAsArrayBuffer() { leitor = this; }
  }
  const pedidos: any[] = [];
  const status = { passos: { passo1Nome: true, passo3CertificadoValido: false }, liberadoParaEmitir: false };
  const contexto = vm.createContext({ document: { getElementById: node, body: node('body', 'onboarding-active'),
    querySelectorAll(s: string) { return s === '.otp-digit' ? otp : tabs; } },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} }, window: { location: { search: '' }, history: {} },
    URLSearchParams, FileReader, Uint8Array, btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
    setTimeout() {}, clearInterval() {}, setInterval() {}, console,
    async fetch(url: string, opcoes?: any) {
      pedidos.push({ url, body: opcoes?.body ? JSON.parse(opcoes.body) : undefined });
      return { ok: true, async json() { return url.includes('/verificar') ? { ok: true, sessao: { usuario: { usuarioId: 'user', medicoId: 'med' } } }
        : url.includes('/status?') ? { ok: true, status } : { ok: true, medicoId: 'med' }; } };
    } });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)![1], contexto);
  return { node, pedidos, otp, contexto, carregarArquivo() { leitor.onload({ target: { result: new Uint8Array([1, 2, 3]).buffer } }); } };
}
test('marca e abas ficam ocultas até concluir o onboarding e voltam ao entrar no painel', () => {
  const t = tela();
  vm.runInContext('mostrarPasso(3)', t.contexto);
  assert.equal(t.node('onboardingTopBar').classList.contains('hidden'), true);
  assert.equal(t.node('tabsNavigation').classList.contains('hidden'), true);
  vm.runInContext('alternarAba("conta")', t.contexto);
  assert.equal(t.node('tabContentConta').classList.contains('hidden'), true);
  vm.runInContext('mostrarPasso(5)', t.contexto);
  assert.equal(t.node('tabsNavigation').classList.contains('hidden'), false);
  assert.equal(t.node('onboardingTopBar').classList.contains('hidden'), false);
  assert.equal(t.node('body').classList.contains('onboarding-active'), false);
});
test('cadastro salva nome somente depois do OTP e segue para certificado', async () => {
  const t = tela();
  t.node('inputNomeCadastro').value = 'Dra. Ana Silva'; t.node('inputTelefone').value = '+55 (51) 98193-6133';
  await t.node('formTelefone').handlers.submit({ preventDefault() {} });
  assert.equal(t.node('authHeader').classList.contains('hidden'), true);
  assert.equal(t.pedidos.length, 1);
  t.otp.forEach(n => n.value = '1');
  await t.node('formOtp').handlers.submit({ preventDefault() {} });
  assert.deepEqual(t.pedidos.find(p => p.url === '/api/onboarding/nome')?.body,
    { usuarioId: 'user', medicoId: 'med', nome: 'Dra. Ana Silva' });
  assert.equal(t.node('step3View').classList.contains('hidden'), false);
});
test('senha aparece apenas ao terminar a leitura e some ao trocar ou remover A1', () => {
  const t = tela();
  assert.equal(t.node('senhaCertWrapper').classList.contains('hidden'), true);
  t.node('fileCertInput').handlers.change({ target: { files: [{ name: 'cert.pfx' }] } });
  assert.equal(t.node('senhaCertWrapper').classList.contains('hidden'), true);
  t.carregarArquivo();
  assert.equal(t.node('senhaCertWrapper').classList.contains('hidden'), false);
  t.node('inputSenhaCert').value = 'segredo';
  t.node('fileCertInput').handlers.change({ target: { files: [] } });
  assert.equal(t.node('senhaCertWrapper').classList.contains('hidden'), true);
  assert.equal(t.node('inputSenhaCert').value, '');
});
test('sair do painel restaura o cadastro e permite autenticar novamente por OTP', () => {
  const t = tela();
  vm.runInContext('mostrarPasso(5)', t.contexto);
  t.node('btnValidarOtp').disabled = true;
  vm.runInContext('efetuarLogout()', t.contexto);
  assert.equal(t.node('body').classList.contains('onboarding-active'), true);
  assert.equal(t.node('tabsNavigation').classList.contains('hidden'), true);
  assert.equal(t.node('authHeader').classList.contains('hidden'), false);
  assert.equal(t.node('btnValidarOtp').disabled, false);
});
