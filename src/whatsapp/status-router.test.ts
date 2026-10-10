import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
async function ambiente(t: any, opcoes: { semMedico?: boolean; erro?: boolean } = {}) {
  const modulo = await import('./status-router.js').catch(() => null);
  assert.ok(modulo, 'Consulta de status autenticada precisa existir');
  const consultas: string[] = [], usuarios: string[] = [];
  const app = express(); app.use('/api/whatsapp', modulo.criarRouterStatusWhatsapp({
    autenticar: async (token: string) => token === 'valido' ? 'auth-user' : null,
    pool: { async query(_sql: string, params: string[]) { usuarios.push(params[0]); return { rows: opcoes.semMedico ? [] : [{ id: 'medico-da-sessao' }] }; } } as any,
    async consultar(medicoId: string) { consultas.push(medicoId); if (opcoes.erro) throw Error('segredo'); return { ok: true, conectado: false, status: 'pendente', detalhe: 'nao-publicar' }; }
  }));
  const server = await new Promise<any>(r => { const s = app.listen(0, '127.0.0.1', () => r(s)); });
  t.after(() => new Promise<void>(r => { server.closeAllConnections(); server.close(() => r()); }));
  return { consultas, usuarios, pedir: (token = 'valido') => fetch(`http://127.0.0.1:${server.address().port}/api/whatsapp/status?medicoId=outro-medico`, { headers: { Authorization: 'Bearer ' + token } }) };
}
test('status exige sessão e consulta exclusivamente o médico ligado a ela', async t => {
  const f = await ambiente(t); assert.equal((await f.pedir('invalido')).status, 401);
  assert.equal(f.consultas.length, 0); assert.equal(f.usuarios.length, 0);
  const r = await f.pedir(); assert.equal(r.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await r.json(), { ok: true, conectado: false, status: 'pendente' });
  assert.deepEqual(f.consultas, ['medico-da-sessao']); assert.deepEqual(f.usuarios, ['auth-user']);
});
test('sessão sem médico e erro não expõem detalhes internos', async t => {
  const f = await ambiente(t, { semMedico: true }); assert.equal((await f.pedir()).status, 403); assert.equal(f.consultas.length, 0);
  const e = await ambiente(t, { erro: true }); const r = await e.pedir(); assert.equal(r.status, 502); assert.doesNotMatch(await r.text(), /segredo/);
});
