import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function tela(respostas: Record<string, any> = {}) {
  const html = readFileSync(new URL('./desenvolvedor-fiscal.html', import.meta.url), 'utf8');
  const nodes = new Map<string, any>();
  const get = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, { value: '', checked: false, disabled: false, hidden: false, textContent: '', files: [], handlers: {},
      reset() {}, addEventListener(e: string, fn: any) { this.handlers[e] = fn; } });
    return nodes.get(id);
  };
  const pedidos: any[] = [];
  const c = vm.createContext({ document: { getElementById: get }, Date, JSON, Number, String, Math,
    FileReader: class { result = 'data:application/x-pkcs12;base64,YTE='; onload: any; readAsDataURL() { this.onload(); } },
    async fetch(url: string, opcoes: any) {
      const body = opcoes.body ? JSON.parse(opcoes.body) : undefined; pedidos.push({ url, ...opcoes, body });
      const data = respostas[url.split('/').at(-1)!] ?? (url.endsWith('/acesso') ? { ok: true } : url.endsWith('/referencia') ? { ok: true, sessaoId: 'sessao', expiraEm: '2026-10-06T02:00:00Z', referencia: { numero: '77', ambienteOrigem: 'producao' }, pendencias: [] }
        : url.endsWith('/preparar') ? { ok: true, tentativaId: 'tentativa', estado: 'preparada', xmlDpsAssinado: '<DPS/>' }
        : url.endsWith('/emitir') ? { ok: true, estado: 'autorizada', detalhe: 'Nota autorizada em homologação.', xmlNota: '<NFSe/>' }
        : { ok: true, eventos: [], tentativas: [] });
      return { ok: true, async json() { return data; } };
    } });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)![1], c);
  return { get, pedidos, async submit(id: string) { await get(id).handlers.submit({ preventDefault() {} }); } };
}
test('fluxo da tela exige preparação e confirmação explícita antes de transmitir', async () => {
  const t = tela();
  t.get('chaveAcesso').value = 'segredo-de-desenvolvedor';
  await t.submit('formAcesso');
  t.get('arquivoA1').files = [{ size: 10 }]; t.get('senhaA1').value = 'senha-do-a1';
  await t.submit('formA1');
  assert.equal(t.get('senhaA1').value, ''); assert.equal(t.get('arquivoA1').value, '');
  assert.equal(t.get('btnEnviar').disabled, true);
  t.get('cpfPaciente').value = '123.456.789-09'; t.get('nomePaciente').value = 'Maria Silva';
  t.get('valorConsulta').value = '170,05'; t.get('competencia').value = '2026-10-05';
  t.get('descricao').value = 'Consulta de teste'; t.get('serieDps').value = '900'; t.get('numeroDps').value = '12345';
  await t.submit('formConsulta');
  assert.ok(!t.pedidos.some(p => p.url.endsWith('/emitir')));
  assert.equal(t.pedidos.at(-1).body.valorCentavos, 17005);
  assert.equal(t.pedidos.at(-1).body.ambiente, undefined);
  assert.equal(t.get('btnEnviar').disabled, true);
  t.get('confirmarHomologacao').checked = true; t.get('confirmarHomologacao').handlers.change();
  await t.get('btnEnviar').handlers.click();
  assert.equal(t.pedidos.at(-1).body.confirmarHomologacao, true);
  assert.equal(t.get('btnEnviar').disabled, true);
  assert.equal(t.get('btnBaixarNota').disabled, false);
  assert.ok(t.get('resultado').textContent.includes('autorizada'));
  assert.equal(t.get('chaveAcesso').value, '');
});

async function preparar(t: ReturnType<typeof tela>) {
  t.get('chaveAcesso').value = 'segredo-de-desenvolvedor'; await t.submit('formAcesso');
  t.get('arquivoA1').files = [{ size: 10 }]; t.get('senhaA1').value = 'senha'; await t.submit('formA1');
  t.get('cpfPaciente').value = '12345678909'; t.get('nomePaciente').value = 'Maria Silva';
  t.get('valorConsulta').value = '170,05'; t.get('competencia').value = '2026-10-05';
  t.get('descricao').value = 'Consulta'; t.get('serieDps').value = '900'; t.get('numeroDps').value = '12345';
  await t.submit('formConsulta');
}
test('alterar a consulta invalida a DPS preparada antes do envio', async () => {
  const t = tela(); await preparar(t);
  t.get('confirmarHomologacao').checked = true; t.get('confirmarHomologacao').handlers.change();
  assert.equal(t.get('btnEnviar').disabled, false);
  t.get('formConsulta').handlers.input();
  assert.equal(t.get('btnEnviar').disabled, true);
  await t.get('btnEnviar').handlers.click();
  assert.ok(!t.pedidos.some(p => p.url.endsWith('/emitir')));
});
test('resultado incerto bloqueia novos envios e nova preparação na tela', async () => {
  const t = tela({ emitir: { ok: true, estado: 'resultado_incerto', detalhe: 'Envio sem confirmação.' } });
  await preparar(t); t.get('confirmarHomologacao').checked = true;
  await t.get('btnEnviar').handlers.click();
  assert.equal(t.get('btnEnviar').disabled, true); assert.equal(t.get('btnPreparar').disabled, true);
  const antes = t.pedidos.length; await t.submit('formConsulta');
  assert.equal(t.pedidos.length, antes);
});
test('encerrar a sessão libera novo A1 e remove referência e XML da tela', async () => {
  const t = tela(); await preparar(t);
  await t.get('btnEncerrar').handlers.click();
  assert.equal(t.pedidos.at(-1).method, 'DELETE');
  assert.equal(t.get('btnExtrair').disabled, false); assert.equal(t.get('btnPreparar').disabled, true);
  assert.equal(t.get('dadosReferencia').textContent, ''); assert.equal(t.get('btnBaixarDps').disabled, true);
});
