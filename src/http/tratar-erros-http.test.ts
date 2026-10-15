import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import express from 'express';
import { configurarDesempenhoHttp } from './configurar-desempenho-http.js';
import { tratarErrosHttp } from './tratar-erros-http.js';

async function comServidor(corpo: (url: string) => Promise<void>): Promise<void> {
  const app = express();
  configurarDesempenhoHttp(app);
  app.use(express.json({ limit: '1kb' }));
  app.post('/eco', (req, res) => res.json(req.body));
  app.get('/grande', (_req, res) => res.json({ texto: 'a'.repeat(5000) }));
  app.get('/quebra', () => { throw new Error('segredo interno'); });
  app.use(tratarErrosHttp);

  const servidor = app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  try { await corpo(`http://127.0.0.1:${(servidor.address() as AddressInfo).port}`); }
  finally { servidor.closeAllConnections(); servidor.close(); }
}

test('JSON malformado responde 400 em JSON, sem HTML nem stack', () => comServidor(async (url) => {
  const resp = await fetch(`${url}/eco`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{quebrado' });
  assert.equal(resp.status, 400);
  assert.deepEqual(await resp.json(), { ok: false, detalhe: 'JSON inválido no corpo da requisição.' });
}));

test('corpo acima do limite responde 413', () => comServidor(async (url) => {
  const resp = await fetch(`${url}/eco`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: 'a'.repeat(2000) }) });
  assert.equal(resp.status, 413);
}));

test('exceção em rota responde 500 genérico sem vazar a mensagem', () => comServidor(async (url) => {
  const original = console.error;
  console.error = () => {};
  try {
    const resp = await fetch(`${url}/quebra`);
    assert.equal(resp.status, 500);
    assert.equal((await resp.json() as { detalhe: string }).detalhe, 'Erro interno do servidor.');
  } finally { console.error = original; }
}));

test('resposta grande é comprimida com gzip e não expõe x-powered-by', () => comServidor(async (url) => {
  const resp = await fetch(`${url}/grande`, { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(resp.headers.get('content-encoding'), 'gzip');
  assert.equal(resp.headers.get('x-powered-by'), null);
  assert.equal((await resp.json() as { texto: string }).texto.length, 5000);
}));
