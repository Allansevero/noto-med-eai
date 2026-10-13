/** Reproduz citações incompletas do modelo usando evidência literal da mesma fonte. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarExtracaoGoogle } from './google-registro.js';

const nome = 'ALICE CASTRO MENEZES XAVIER';
const fonte = { indice: 0, titulo: 'Alice Castro Menezes Xavier opiniões - Psiquiatra',
  trecho: 'Número de registro: CRM 36948 RS - RQE 29510.',
  url: 'https://www.doctoralia.com.br/alice-castro-menezes-xavier/psiquiatra/porto-alegre' };
const registro = { nomeCompleto: nome, crm: '36948', uf: 'RS',
  evidenciaCrm: { fonte: 0, trechos: ['Alice Castro Menezes Xavier', fonte.trecho] },
  rqes: [{ numero: '29510', evidencia: { fonte: 0, trecho: fonte.trecho } }] };

test('RQE com nome no título da mesma fonte é preservado apesar da omissão na citação do modelo', () => {
  const r = validarExtracaoGoogle(nome, [fonte], JSON.stringify({ registros: [registro, { ...registro, rqes: [] }] }))?.[0];
  assert.equal(r?.rqe, '29510');assert.deepEqual(r?.rqes, ['29510']);assert.equal(r?.verificado, false);
  assert.equal(r?.fontesRqe?.[0].evidencia, `${fonte.titulo}\n${fonte.trecho}`);
  assert.equal(r?.fontesRqe?.[0].urlOrigem, fonte.url);assert.equal(r?.fontesRqe?.[0].ufOrigem, 'crm');
});

test('citação completada pelo título respeita limite de tamanho da evidência', () => {
  const longa = { ...fonte, titulo: `${fonte.titulo}${' '.repeat(500)}fim` };
  assert.deepEqual(validarExtracaoGoogle(nome, [longa], JSON.stringify({ registros: [registro] }))?.[0].rqes, []);
});

test('não completa o nome com título de outra fonte, handle, URL ou texto inventado', () => {
  for (const titulo of ['Perfil de outra médica', '@alicecastromenezesxavier', 'Número de registro']) {
    const outraFonte = { ...fonte, indice: 1, titulo };
    const r = { ...registro, rqes: [{ numero: '29510', evidencia: { fonte: 1, trecho: fonte.trecho } }] };
    assert.deepEqual(validarExtracaoGoogle(nome, [fonte, outraFonte], JSON.stringify({ registros: [r] }))?.[0].rqes, []);
  }
  const inventado = { ...registro, rqes: [{ numero: '29510', evidencia: { fonte: 0, trecho: 'CRM 36948 RS - RQE 29510 inventado' } }] };
  assert.deepEqual(validarExtracaoGoogle(nome, [fonte], JSON.stringify({ registros: [inventado] }))?.[0].rqes, []);
});

test('complementar nome pelo título não autoriza CRM ausente, RQE truncado ou UF divergente', () => {
  for (const [trecho, citacao] of [
    ['CRM 36948 RS - RQE 295105.', 'CRM 36948 RS - RQE 29510'],
    ['CRM 36948 RS - RQE 29510/SC.', 'CRM 36948 RS - RQE 29510'],
    [fonte.trecho, 'RQE 29510']
  ]) {
    const f = { ...fonte, trecho };
    const r = { ...registro, evidenciaCrm: { fonte: 0, trechos: ['Alice Castro Menezes Xavier', trecho] },
      rqes: [{ numero: '29510', evidencia: { fonte: 0, trecho: citacao } }] };
    assert.deepEqual(validarExtracaoGoogle(nome, [f], JSON.stringify({ registros: [r] }))?.[0].rqes, [], trecho);
  }
});
