/**
 * Testes unitários para a validação pura de nome civil de tomador.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ehNomeCivilValido } from './validar-nome-civil.js';

describe('ehNomeCivilValido', () => {
  it('deve rejeitar nulo, indefinido e vazio', () => {
    assert.strictEqual(ehNomeCivilValido(null), false);
    assert.strictEqual(ehNomeCivilValido(undefined), false);
    assert.strictEqual(ehNomeCivilValido(''), false);
    assert.strictEqual(ehNomeCivilValido('   '), false);
  });

  it('deve rejeitar valores genéricos como PACIENTE independente da caixa', () => {
    assert.strictEqual(ehNomeCivilValido('PACIENTE'), false);
    assert.strictEqual(ehNomeCivilValido('paciente'), false);
    assert.strictEqual(ehNomeCivilValido('Paciente'), false);
  });

  it('deve rejeitar nomes com apenas uma palavra ou muito curtos', () => {
    assert.strictEqual(ehNomeCivilValido('Ana'), false);
    assert.strictEqual(ehNomeCivilValido('Carlos'), false);
    assert.strictEqual(ehNomeCivilValido('A B'), false);
  });

  it('deve aceitar nomes completos reais com ao menos duas palavras', () => {
    assert.strictEqual(ehNomeCivilValido('João Silva'), true);
    assert.strictEqual(ehNomeCivilValido('Maria da Silva'), true);
    assert.strictEqual(ehNomeCivilValido('EMELLYN ANTUNES RODRIGUES SEVERO'), true);
    assert.strictEqual(ehNomeCivilValido('Carlos Eduardo de Souza'), true);
  });
});
