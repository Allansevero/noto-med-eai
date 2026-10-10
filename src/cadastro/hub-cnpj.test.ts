import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as consultas from './consultas.js';

const cnpj = '11222333000181';
const token = 'credencial-sintetica &?';
const corpo = { status: 'true', return: 'OK', consumed: 1, result: {
  numero_de_inscricao: cnpj, nome: 'Clínica Exemplo', quadro_socios: ['ANA DE SOUZA 49-Sócio-Administrador']
} };
function cliente(chave: string, requisitar: typeof fetch) {
  return new consultas.HubConsultaEmpresa(chave, requisitar);
}
function fonte(chave: string | undefined, requisitar: typeof fetch) {
  return consultas.criarConsultaEmpresa(chave, requisitar);
}
test('Hub consulta por HTTPS, sem opções extras cobradas, e interpreta empresa e candidatos', async t => {
  let timeout = 0;
  t.mock.method(AbortSignal, 'timeout', (ms: number) => { timeout = ms; return new AbortController().signal; });
  let chamadas = 0;
  const requisitar = (async (entrada, opcoes) => {
    chamadas++;
    const url = new URL(String(entrada));
    assert.equal(url.origin, 'https://ws.hubdodesenvolvedor.com.br');
    assert.equal(url.pathname, '/v2/cnpj/');
    assert.deepEqual([...url.searchParams.entries()], [['cnpj', cnpj], ['token', token]]);
    assert.equal(opcoes?.redirect, 'error');
    assert.ok(opcoes?.signal);
    return new Response(JSON.stringify(corpo));
  }) as typeof fetch;
  const r = await cliente(token, requisitar).consultar(cnpj);
  assert.equal(r.estado, 'consultado');
  if (r.estado === 'consultado') {
    assert.equal(r.dados.razaoSocial, 'Clínica Exemplo');
    assert.equal(r.dados.origem, 'Hub do Desenvolvedor');
    assert.deepEqual(r.dados.candidatos.map(c => c.nome), ['ANA DE SOUZA']);
    assert.equal('medico' in r.dados, false);
  }
  assert.equal(chamadas, 1);
  assert.equal(timeout, 300_000);
});
test('Hub não consulta com documento inválido ou token ausente', async () => {
  const requisitar = (async () => { assert.fail('não deve consultar'); }) as typeof fetch;
  assert.equal((await cliente('', requisitar).consultar(cnpj)).estado, 'indisponivel');
  assert.equal((await cliente(token, requisitar).consultar('123')).estado, 'indisponivel');
});
test('return NOK prevalece mesmo com status true e dados válidos', () => {
  assert.equal(consultas.lerRespostaHubCnpj({ ...corpo, return: 'NOK' }, cnpj).estado, 'indisponivel');
});
test('Hub rejeita documento divergente, JSON inválido, HTTP rejeitado e redirecionamento', async () => {
  for (const resposta of [new Response(JSON.stringify({ ...corpo, result: { ...corpo.result, numero_de_inscricao: '99999999000199' } })),
    new Response('não JSON'), new Response('', { status: 403 }), new Response('', { status: 302 })]) {
    const r = await cliente(token, (async () => resposta) as typeof fetch).consultar(cnpj);
    assert.equal(r.estado, 'indisponivel');
  }
});
test('Hub retorna diagnóstico sanitizado sem corpo, URL, documento ou credencial', async () => {
  const requisitar = (async () => { throw new Error(`https://ws.hubdodesenvolvedor.com.br/?cnpj=${cnpj}&token=${token}`); }) as typeof fetch;
  const r = await cliente(token, requisitar).consultar(cnpj);
  assert.deepEqual(r, { estado: 'indisponivel', codigo: 'HUB_CNPJ_CONSULTA_INDISPONIVEL' });
  const rejeitado = await cliente(token, (async () => new Response(JSON.stringify({ return: 'NOK', message: token }))) as typeof fetch).consultar(cnpj);
  assert.equal(JSON.stringify(rejeitado).includes(token), false);
});
test('fonte com token prioriza Hub; resposta válida sem sócios não vira outra consulta', async () => {
  const chamadas: string[] = [];
  const r = await fonte(token, (async entrada => {
    chamadas.push(new URL(String(entrada)).hostname);
    return new Response(JSON.stringify({ ...corpo, result: { ...corpo.result, quadro_socios: [] } }));
  }) as typeof fetch).consultar(cnpj);
  assert.equal(r.estado, 'consultado');
  if (r.estado === 'consultado') assert.deepEqual(r.dados.candidatos, []);
  assert.deepEqual(chamadas, ['ws.hubdodesenvolvedor.com.br']);
});
test('falha do Hub usa BrasilAPI uma vez, preservando a origem dos candidatos', async () => {
  const chamadas: string[] = [];
  const r = await fonte(token, (async entrada => {
    const host = new URL(String(entrada)).hostname; chamadas.push(host);
    return new Response(JSON.stringify(host === 'brasilapi.com.br'
      ? { cnpj, razao_social: 'Clínica Exemplo', qsa: [{ nome_socio: 'Ana de Souza' }] }
      : { status: false, return: 'NOK', message: 'Token inválido' }));
  }) as typeof fetch).consultar(cnpj);
  assert.equal(r.estado, 'consultado');
  if (r.estado === 'consultado') assert.equal(r.dados.origem, 'BrasilAPI / Minha Receita');
  assert.deepEqual(chamadas, ['ws.hubdodesenvolvedor.com.br', 'brasilapi.com.br']);
});
test('sem token utiliza apenas BrasilAPI e com duas falhas preserva diagnóstico do Hub', async () => {
  const chamadas: string[] = [];
  const requisitar = (async entrada => { chamadas.push(new URL(String(entrada)).hostname); return new Response('{}', { status: 503 }); }) as typeof fetch;
  await fonte(undefined, requisitar).consultar(cnpj);
  assert.deepEqual(chamadas, ['brasilapi.com.br']);
  assert.deepEqual(await fonte(token, requisitar).consultar(cnpj), { estado: 'indisponivel', codigo: 'HUB_CNPJ_CONSULTA_INDISPONIVEL' });
});
test('cancelamento da consulta Hub permite alternativa e não propaga motivo sensível', async t => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, 'timeout', () => controller.signal);
  const chamadas: string[] = [];
  const requisitar = (async (entrada, opcoes) => {
    const host = new URL(String(entrada)).hostname; chamadas.push(host);
    if (host === 'brasilapi.com.br') return new Response('{}', { status: 503 });
    return await new Promise<Response>((_resolve, reject) => {
      opcoes!.signal!.addEventListener('abort', () => reject(opcoes!.signal!.reason), { once: true });
      queueMicrotask(() => controller.abort(new Error(`Timeout: ${cnpj} ${token}`)));
    });
  }) as typeof fetch;
  assert.deepEqual(await fonte(token, requisitar).consultar(cnpj), {
    estado: 'indisponivel', codigo: 'HUB_CNPJ_CONSULTA_INDISPONIVEL'
  });
  assert.deepEqual(chamadas, ['ws.hubdodesenvolvedor.com.br', 'brasilapi.com.br']);
});
