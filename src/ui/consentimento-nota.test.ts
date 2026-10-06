/** Executa os handlers reais do HTML; somente DOM e HTTP são simulados. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function tela(resposta: any = { ok: true }) {
  const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
  const codigo = script.slice(script.indexOf('// --- NOTA PADRÃO:'), script.indexOf('// --- PASSO 2: CERTIFICADO A1'));
  const nodes = new Map<string, any>();
  const get = (id: string) => {
    if (!nodes.has(id)) nodes.set(id, { checked: false, disabled: false, textContent: '', handlers: {} as any,
      classList: { add() {}, remove() {} }, addEventListener(e: string, h: any) { this.handlers[e] = h; } });
    return nodes.get(id);
  };
  const pedidos: any[] = [], mensagens: string[] = [];
  let avancos = 0;
  const contexto = vm.createContext({ document: { getElementById: get }, sessaoAtual: { usuario: { medicoId: 'med' } },
    alertOnboarding: {}, hideAlert() {}, showAlert(m: string) { mensagens.push(m); }, mostrarPasso() {},
    async carregarFluxoOnboarding() { avancos++; },
    async fetch(url: string, opcoes: any) { pedidos.push({ url, body: JSON.parse(opcoes.body) });
      const retorno = await resposta;
      return { ok: retorno.ok, async json() { return retorno; } }; } });
  vm.runInContext(codigo, contexto);
  const exibir = (pendencias: string[] = [], opcao = 'me_epp') => {
    contexto.ref = { versao: 2, hash: 'ref', numero: '47', emitidaEm: '2026-10-01',
      pendencias, parametrosSugeridos: { opcaoSimplesNacional: opcao } };
    contexto.perfil = { razaoSocial: 'Clínica', codMunicipioIbge: '4314902', uf: 'RS' };
    vm.runInContext('mostrarReferenciaFiscal(ref, perfil)', contexto);
  };
  const consentir = () => { get('confirmarNotaPadrao').checked = true; get('confirmarNotaPadrao').handlers.change(); };
  return { get, pedidos, mensagens, exibir, consentir, avancos: () => avancos };
}

test('consentimento permite confirmar referência suportada e avançar após sucesso do servidor', async () => {
  const t = tela(); t.exibir();
  assert.equal(t.get('btnConfirmarFiscal').disabled, true);
  t.consentir();
  assert.equal(t.get('btnConfirmarFiscal').disabled, false);
  await t.get('btnConfirmarFiscal').handlers.click();
  assert.deepEqual(t.pedidos[0].body, { medicoId: 'med', referenciaHash: 'ref', usarReferencia: true });
  assert.equal(t.avancos(), 1);
});
test('consentimento com pendência permite obter explicação do servidor sem liberar nem avançar', async () => {
  const t = tela({ ok: false, detalhe: 'A alíquota de ISS desta referência precisa de suporte adicional.' });
  t.exibir(['tribMun/pAliq: precisa de tratamento específico.']); t.consentir();
  assert.equal(t.get('btnConfirmarFiscal').disabled, false);
  await t.get('btnConfirmarFiscal').handlers.click();
  assert.equal(t.pedidos.length, 1);
  assert.equal(t.avancos(), 0);
  assert.match(t.mensagens.at(-1)!, /alíquota de ISS/);
});
test('regime sem suporte recebe validação do servidor em vez de botão inerte', () => {
  const t = tela(); t.exibir(['A emissão para não optante pelo Simples ainda precisa de suporte adicional.'], 'nao_optante');
  t.consentir();
  assert.equal(t.get('btnConfirmarFiscal').disabled, false);
});

test('alterar consentimento durante a confirmação não permite enviar uma segunda solicitação', async () => {
  let concluir!: (resposta: any) => void;
  const t = tela(new Promise(resolve => { concluir = resolve; })); t.exibir(); t.consentir();
  const primeira = t.get('btnConfirmarFiscal').handlers.click();
  t.consentir();
  assert.equal(t.get('btnConfirmarFiscal').disabled, true);
  const segunda = t.get('btnConfirmarFiscal').handlers.click();
  concluir({ ok: true });
  await Promise.all([primeira, segunda]);
  assert.equal(t.pedidos.length, 1);
});
