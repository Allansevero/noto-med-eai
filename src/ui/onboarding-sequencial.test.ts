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
      nodes.set(id, { value: '', textContent: '', disabled: false, handlers: {} as any, dataset: {}, style: { setProperty(k: string, v: string) { (this as any)[k] = v; } },
        children: [] as any[], replaceChildren() { this.children = []; }, append(...els: any[]) { this.children.push(...els); },
        classList: { add(...c: string[]) { c.forEach(v => valores.add(v)); }, remove(...c: string[]) { c.forEach(v => valores.delete(v)); },
          contains(c: string) { return valores.has(c); }, toggle(c: string, ativo = !valores.has(c)) { ativo ? valores.add(c) : valores.delete(c); } },
        addEventListener(e: string, h: any) { this.handlers[e] = h; }, setAttribute() {}, checkValidity() { return true; }, focus() {}, querySelector() { return null; } });
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
  const status: any = { passos: { passo1Nome: false, passo3CertificadoValido: false }, liberadoParaEmitir: false };
  const contexto = vm.createContext({ document: { getElementById: node, createElement() { return node('created' + nodes.size); }, body: node('body', 'onboarding-active'),
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
  return { node, pedidos, otp, contexto, status, carregarArquivo() { leitor.onload({ target: { result: new Uint8Array([1, 2, 3]).buffer } }); } };
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
test('acesso por telefone e OTP não pede nem salva nome e segue para certificado', async () => {
  const t = tela();
  t.node('inputTelefone').value = '+55 (51) 98193-6133';
  await t.node('formTelefone').handlers.submit({ preventDefault() {} });
  assert.equal(t.node('authHeader').classList.contains('hidden'), true);
  assert.equal(t.pedidos.length, 1);
  t.otp.forEach(n => n.value = '1');
  await t.node('formOtp').handlers.submit({ preventDefault() {} });
  assert.equal(t.pedidos.some(p => p.url === '/api/onboarding/nome'), false);
  assert.equal(t.node('step3View').classList.contains('hidden'), false);
});
test('certificado salvo avança ao WhatsApp sem expor parâmetros ou exigir confirmação', async () => {
  const t = tela();
  vm.runInContext('sessaoAtual = { usuario: { medicoId: "med" } }; mostrarPasso(3)', t.contexto);
  t.node('fileCertInput').handlers.change({ target: { files: [{ name: 'cert.pfx' }] } }); t.carregarArquivo();
  t.node('inputSenhaCert').value = 'segredo';
  await t.node('btnSalvarCertificado').handlers.click();
  assert.equal(t.node('step4View').classList.contains('hidden'), false);
  assert.equal(t.node('tabContentConta').classList.contains('hidden'), true);
  assert.equal(t.pedidos.some(p => p.url === '/api/onboarding/confirmar-fiscal'), false);
  assert.equal(t.pedidos.find(p => p.url === '/api/onboarding/certificado').body.consentimentoFiscal, 'continuar-a1-v1');
  assert.equal(t.node('alertOnboarding').classList.contains('hidden'), true);
});
test('nome e confirmação fiscal pendentes não bloqueiam acesso à Conta após WhatsApp', () => {
  const t = tela();
  t.contexto.statusTeste = { nomeUsuario: '', liberadoParaEmitir: false,
    passos: { passo1Nome: false, passo3CertificadoValido: true, passo4WhatsappConectado: true, passo2FiscalConfirmado: false } };
  vm.runInContext('renderizarPassos(statusTeste); alternarAba("conta")', t.contexto);
  assert.equal(t.node('tabsNavigation').classList.contains('hidden'), false);
  assert.equal(t.node('tabContentConta').classList.contains('hidden'), false);
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

test('Conta mostra parâmetros pendentes sem pedir um novo aceite ou contornar a validação', async () => {
  const t = tela();
  t.status.passos.passo3CertificadoValido = true; t.status.passos.passo4WhatsappConectado = true;
  t.status.passos.passo2FiscalConfirmado = false;
  t.status.perfilFiscal = { razaoSocial: 'Clínica', codMunicipioIbge: '4314902', uf: 'RS',
    referenciaFiscal: { versao: 2, hash: 'ref', parametrosSugeridos: { opcaoSimplesNacional: 'nao_optante', aliquotaIss: 2 } } };
  vm.runInContext('sessaoAtual = { usuario: { medicoId: "med" } }; renderizarPassos(statusMock)',
    Object.assign(t.contexto, { statusMock: t.status }));
  await vm.runInContext('atualizarVisualizacaoConta()', t.contexto);
  assert.deepEqual(t.node('parametrosFiscaisConta').children.map((el: any) => el.textContent),
    ['Simples Nacional', 'Não optante', 'Alíquota de ISS (%)', '2']);
  assert.equal(t.node('statusAdocaoFiscalConta').textContent.includes('pendente'), true);
  assert.equal(t.node('statusFiscalPainel').textContent, 'PENDENTE');
  assert.equal(t.pedidos.some(p => p.url === '/api/onboarding/confirmar-fiscal'), false);
});

test('alertas de sucesso não aparecem entre etapas; erros locais continuam visíveis', () => {
  const t = tela();
  vm.runInContext('showAlert("Código enviado", false)', t.contexto);
  assert.equal(t.node('alertBox').classList.contains('hidden'), true);
  vm.runInContext('showAlert("Senha incorreta", true, alertOnboarding)', t.contexto);
  assert.equal(t.node('alertOnboarding').classList.contains('hidden'), false);
  vm.runInContext('mostrarPasso(4)', t.contexto);
  assert.equal(t.node('alertOnboarding').classList.contains('hidden'), true);
});

test('menu da Conta abre seção interna sem abas e Voltar restaura o menu', () => {
  const t = tela();
  vm.runInContext('mostrarPasso(5); alternarAba("conta"); abrirSecaoConta("dados")', t.contexto);
  assert.equal(t.node('tabsNavigation').classList.contains('hidden'), true);
  assert.equal(t.node('contaMenu').classList.contains('hidden'), true);
  assert.equal(t.node('contaSecaoDados').classList.contains('hidden'), false);
  vm.runInContext('voltarMenuConta()', t.contexto);
  assert.equal(t.node('tabsNavigation').classList.contains('hidden'), false);
  assert.equal(t.node('contaMenu').classList.contains('hidden'), false);
  assert.equal(t.node('contaSecaoDados').classList.contains('hidden'), true);
});
test('cada opção da Conta abre apenas sua seção e fiscal permanece separado dos dados pessoais', () => {
  const t = tela();vm.runInContext('mostrarPasso(5); alternarAba("conta")', t.contexto);
  for (const secao of ['fiscal', 'preferencias', 'faturamento', 'membros', 'convites', 'deletar']) {
    t.contexto.secaoTeste = secao;vm.runInContext('abrirSecaoConta(secaoTeste)', t.contexto);
    assert.equal(t.node('tabsNavigation').classList.contains('hidden'), true);
    assert.equal(t.node('contaSecaoDados').classList.contains('hidden'), true);
  }
  vm.runInContext('abrirSecaoConta("fiscal")', t.contexto);
  assert.equal(t.node('contaSecaoFiscal').classList.contains('hidden'), false);
});


test('edição fiscal preserva tipos e referência, permite cancelar e salva pelo endpoint validado', async () => {
  const t = tela();
  vm.runInContext('sessaoAtual = { usuario: { medicoId: "med" } }; referenciaFiscalAtual = { hash: "referencia-original", versao: 2 }; exibirParametrosConta({ambiente:"producao",vigenciaInicio:"2026-10-06",aliquotaIss:2,ibscbs:{CST:"000",cClassTrib:"000001"}})', t.contexto);
  t.node('btnEditarFiscal').handlers.click();
  vm.runInContext('camposFiscaisEdicao.get("aliquotaIss").input.value = "3.5"; exibirParametrosConta({aliquotaIss:9})', t.contexto);
  t.status.perfilFiscal = { referenciaFiscal: { versao: 2, hash: 'referencia-original' }, parametrosEmissao: { parametros: {ambiente:'producao',vigenciaInicio:'2026-10-06',aliquotaIss:3.5,ibscbs:{CST:'000',cClassTrib:'000001'}} } };
  await t.node('btnSalvarFiscal').handlers.click();
  const pedido = t.pedidos.find(p => p.url === '/api/onboarding/confirmar-fiscal');
  assert.equal(pedido.body.parametrosEmissao.aliquotaIss, 3.5);
  assert.equal(pedido.body.parametrosEmissao.ibscbs.CST, '000');
  assert.equal(pedido.body.referenciaHash, 'referencia-original');
  assert.equal(pedido.body.usarReferencia, false);
  t.node('btnEditarFiscal').handlers.click();
  vm.runInContext('camposFiscaisEdicao.get("aliquotaIss").input.value = "8"', t.contexto);
  t.node('btnCancelarFiscal').handlers.click();
  assert.equal(t.pedidos.filter(p => p.url === '/api/onboarding/confirmar-fiscal').length, 1);
  assert.equal(vm.runInContext('parametrosFiscaisAtuais.aliquotaIss', t.contexto), 3.5);
});


test('rejeição fiscal mantém o rascunho e não duplica um salvamento em andamento', async () => {
  const t = tela();
  vm.runInContext('sessaoAtual = { usuario: { medicoId: "med" } }; referenciaFiscalAtual = { hash: "ref", versao: 2 }; exibirParametrosConta({aliquotaIss:2})', t.contexto);
  t.node('btnEditarFiscal').handlers.click();
  vm.runInContext('camposFiscaisEdicao.get("aliquotaIss").input.value="3"', t.contexto);
  let resolver: any; let chamadas = 0;
  t.contexto.fetch = () => { chamadas++; return new Promise(resolve => { resolver = resolve; }); };
  const salvar = t.node('btnSalvarFiscal').handlers.click();
  await t.node('btnSalvarFiscal').handlers.click();
  assert.equal(chamadas, 1);
  assert.equal(t.node('btnCancelarFiscal').disabled, true);
  resolver({ok:false, async json() {return {ok:false, detalhe:'Classificação incompatível com a referência.'};}});
  await salvar;
  assert.equal(vm.runInContext('edicaoFiscal', t.contexto), true);
  assert.equal(vm.runInContext('camposFiscaisEdicao.get("aliquotaIss").input.value', t.contexto), '3');
  assert.equal(t.node('statusEdicaoFiscal').textContent, 'Classificação incompatível com a referência.');
  assert.equal(t.node('btnSalvarFiscal').disabled, false);
});
