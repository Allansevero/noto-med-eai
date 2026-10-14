import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizarTelefone } from './normalizar-telefone.js';

test('normalizarTelefone com DDI 55 e formatação', () => {
  assert.equal(normalizarTelefone('+55 (11) 98765-4321'), '5511987654321');
  assert.equal(normalizarTelefone('5511987654321'), '5511987654321');
  assert.equal(normalizarTelefone('(11) 98765-4321'), '5511987654321');
  assert.equal(normalizarTelefone('(51) 3333-4444'), '555133334444');
  assert.equal(normalizarTelefone('123'), null);
  assert.equal(normalizarTelefone(''), null);
});
