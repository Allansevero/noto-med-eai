/**
 * Testes unitários para medição e registro de etapas/latência.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { criarRastreadorLatencia } from './medir-etapas.js';

test('rastreador cronometra etapas individuais e tempo acumulado', async () => {
  const rastreador = criarRastreadorLatencia();

  const finalizarLeitura = rastreador.iniciarEtapa('marcar_como_lida');
  await new Promise(r => setTimeout(r, 10));
  finalizarLeitura();

  const finalizarIa = rastreador.iniciarEtapa('chamada_ia');
  await new Promise(r => setTimeout(r, 10));
  finalizarIa();

  const metricas = rastreador.obterMetricas();
  assert.equal(metricas.length, 2);
  assert.equal(metricas[0].etapa, 'marcar_como_lida');
  assert.equal(metricas[1].etapa, 'chamada_ia');
  assert.ok(metricas[0].duracaoMs >= 8);
  assert.ok(metricas[1].duracaoMs >= 8);
  assert.ok(rastreador.tempoTotalMs() >= 16);
});
