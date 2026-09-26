import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  excedeuTentativasEmissao,
  calcularProximaTentativa,
  lockWorkerExpirado
} from './calcular-proxima-tentativa.js';

describe('calcular-proxima-tentativa', () => {
  it('deve identificar quando atingiu o limite de tentativas', () => {
    assert.strictEqual(excedeuTentativasEmissao(1), false);
    assert.strictEqual(excedeuTentativasEmissao(2), false);
    assert.strictEqual(excedeuTentativasEmissao(3), true);
    assert.strictEqual(excedeuTentativasEmissao(4), true);
  });

  it('deve aplicar backoff exponencial a cada tentativa falha', () => {
    const base = new Date('2026-09-26T12:00:00Z');

    // Tentativa 1: +60s
    const t1 = calcularProximaTentativa(1, base);
    assert.strictEqual(t1.toISOString(), '2026-09-26T12:01:00.000Z');

    // Tentativa 2: +120s
    const t2 = calcularProximaTentativa(2, base);
    assert.strictEqual(t2.toISOString(), '2026-09-26T12:02:00.000Z');

    // Tentativa 3: +240s
    const t3 = calcularProximaTentativa(3, base);
    assert.strictEqual(t3.toISOString(), '2026-09-26T12:04:00.000Z');
  });

  it('deve verificar expiração do lock do worker', () => {
    const agora = new Date('2026-09-26T12:10:00Z');
    const bloqueioRecente = new Date('2026-09-26T12:08:00Z'); // 2 min atrás (< 5 min)
    const bloqueioExpirado = new Date('2026-09-26T12:04:00Z'); // 6 min atrás (>= 5 min)

    assert.strictEqual(lockWorkerExpirado(null, agora), true);
    assert.strictEqual(lockWorkerExpirado(bloqueioRecente, agora), false);
    assert.strictEqual(lockWorkerExpirado(bloqueioExpirado, agora), true);
  });
});
