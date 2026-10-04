/** Valida a fronteira não confiável do modelo sem acesso à API externa. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GroqDecisorFiscal } from './groq-decisor-fiscal.js';

test('aceita somente o contrato restrito de decisão', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ choices: [{ message: {
    content: JSON.stringify({ acao: 'tentar_novamente', causa: 'DNS temporário', justificativa: 'sem envio', acaoNecessaria: 'repetir' })
  } }] }), { status: 200 }));
  const decisao = await new GroqDecisorFiscal('fake', 'modelo').decidir({ retentativaPermitida: true });
  assert.equal(decisao.acao, 'tentar_novamente');
});
test('recusa ferramenta inventada pelo modelo', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ choices: [{ message: {
    content: JSON.stringify({ acao: 'alterar_regime', causa: 'x', justificativa: 'x', acaoNecessaria: 'x' })
  } }] }), { status: 200 }));
  await assert.rejects(() => new GroqDecisorFiscal('fake', 'modelo').decidir({}));
});
test('JSON inválido e indisponibilidade nunca viram autorização', async t => {
  const fake = t.mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 503 }));
  await assert.rejects(() => new GroqDecisorFiscal('fake', 'modelo').decidir({}));
  fake.mock.mockImplementation(async () => new Response('{"choices":[]}', { status: 200 }));
  await assert.rejects(() => new GroqDecisorFiscal('fake', 'modelo').decidir({}));
});
