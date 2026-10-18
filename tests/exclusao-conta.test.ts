import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { criarAppExpress } from '../src/server.js';

vi.mock('../src/io/postgres/pool.js', () => ({ pool: {
  async query() { throw new Error('SQL inesperado; banco externo não disponível no teste'); }
} }));

let servidor: Server;
let base: string;
let app: ReturnType<typeof criarAppExpress>;

beforeAll(async () => {
  app = criarAppExpress(); servidor = createServer(app);
  await new Promise<void>(resolver => servidor.listen(0, '127.0.0.1', resolver));
  base = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await app.locals.encerrarCofres();
  await new Promise<void>((resolver, rejeitar) => servidor.close(erro => erro ? rejeitar(erro) : resolver()));
});

describe('exclusão de conta ainda ausente no aplicativo atual', () => {
  it('interface apresenta somente aviso de disponibilidade futura', async () => {
    const resposta = await fetch(base);
    expect(resposta.status).toBe(200);
    const html = await resposta.text();
    const secao = html.match(/<section id="contaSecaoDeletar"[\s\S]*?<\/section>/)?.[0];
    expect(secao).toContain('A exclusão da conta será disponibilizada aqui, com confirmação antes de executar a ação.');
    expect(secao).not.toMatch(/<(button|form|input)\b/);
  });

  it.each([
    ['DELETE', '/api/conta'], ['POST', '/api/conta/excluir']
  ])('%s %s não é uma operação de exclusão implementada', async (method, rota) => {
    const resposta = await fetch(base + rota, { method, headers: { Authorization: 'Bearer sessao-ficticia' } });
    expect(resposta.status).toBe(404);
    expect(await resposta.text()).toContain(`Cannot ${method} ${rota}`);
  });
});
