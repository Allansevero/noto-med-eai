import assert from 'node:assert/strict';
import test from 'node:test';
import { montarRespostaErroHttp } from './montar-resposta-erro-http.js';

test('JSON malformado vira 400 com mensagem em JSON', () => {
  const r = montarRespostaErroHttp({ type: 'entity.parse.failed', status: 400 });
  assert.equal(r.status, 400);
  assert.deepEqual(r.corpo, { ok: false, detalhe: 'JSON inválido no corpo da requisição.' });
});

test('corpo acima do limite vira 413', () => {
  assert.equal(montarRespostaErroHttp({ type: 'entity.too.large', status: 413 }).status, 413);
});

test('erro 4xx desconhecido preserva o status sem vazar a mensagem original', () => {
  const r = montarRespostaErroHttp({ status: 404, message: 'caminho interno /srv/x' });
  assert.equal(r.status, 404);
  assert.equal(r.corpo.detalhe, 'Requisição inválida.');
});

test('exceção inesperada ou valor não-objeto vira 500 genérico', () => {
  for (const erro of [new Error('senha do banco: abc'), undefined, null, 'texto']) {
    const r = montarRespostaErroHttp(erro);
    assert.equal(r.status, 500);
    assert.equal(r.corpo.detalhe, 'Erro interno do servidor.');
  }
});

test('status 5xx vindo do erro não é repassado: sempre 500', () => {
  assert.equal(montarRespostaErroHttp({ status: 502 }).status, 500);
});
