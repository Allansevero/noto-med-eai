/** Contrato de cópia e fallback: nenhuma chamada usa um WhatsApp de paciente. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enviarMensagemTreino } from './enviar-mensagem-treino.js';
import { MODELO_EMISSAO_TREINO, MENSAGENS_TREINO } from '../../onboarding/treino/mensagens-treino.js';

const config = { baseUrl: 'https://evolution.exemplo.com/', apiKey: 'teste', instanciaOficial: 'noto_oficial' };
const mensagem = MENSAGENS_TREINO[2];
test('envia modelo exato no botão de copiar pela instância oficial', async t => {
  const chamadas: any[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    chamadas.push({ url, body: JSON.parse(String(init.body)), signal: init.signal });
    return new Response(JSON.stringify({ key: { id: 'MSG-1' } }), { status: 201 });
  });
  const resultado = await enviarMensagemTreino(config, '51999998888', mensagem);
  assert.deepEqual(resultado, { sucesso: true, mensagemId: 'MSG-1', formato: 'botao' });
  assert.equal(chamadas.length, 1);
  assert.ok(chamadas[0].url.endsWith('/sendButtons/noto_oficial'));
  assert.equal(chamadas[0].body.number, '5551999998888');
  assert.equal(chamadas[0].body.buttons[0].copyCode, MODELO_EMISSAO_TREINO);
  assert.equal(chamadas[0].body.description, mensagem.texto);
  assert.equal(chamadas[0].body.title, '');
  assert.equal(chamadas[0].body.footer, '');
  assert.ok(chamadas[0].signal instanceof AbortSignal);
});
test('rejeição explícita do botão usa texto copiável sem instruções extras', async t => {
  const chamadas: any[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    chamadas.push({ url, body: JSON.parse(String(init.body)) });
    return new Response('{}', { status: chamadas.length === 1 ? 400 : 201 });
  });
  const resultado = await enviarMensagemTreino(config, '5551999998888', mensagem);
  assert.equal(resultado.sucesso, true);
  assert.equal(chamadas.length, 2);
  assert.ok(chamadas[1].url.endsWith('/sendText/noto_oficial'));
  assert.equal(chamadas[1].body.text, mensagem.texto);
});
test('timeout ou erro 5xx não dispara um segundo envio', async t => {
  let chamadas = 0;
  const mock = t.mock.method(globalThis, 'fetch', async () => { chamadas++; throw new Error('timeout'); });
  const a = await enviarMensagemTreino(config, '5551999998888', mensagem);
  assert.ok(!a.sucesso && a.incerto); assert.equal(chamadas, 1);
  mock.mock.mockImplementation(async () => { chamadas++; return new Response('{}', { status: 500 }); });
  const b = await enviarMensagemTreino(config, '5551999998888', mensagem);
  assert.ok(!b.sucesso && b.incerto); assert.equal(chamadas, 2);
});
