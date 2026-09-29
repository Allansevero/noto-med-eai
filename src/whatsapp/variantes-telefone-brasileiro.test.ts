import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gerarVariantesTelefoneBrasileiro } from './variantes-telefone-brasileiro.js';

describe('gerarVariantesTelefoneBrasileiro', () => {
  it('inclui versões com e sem o nono dígito e código do país', () => {
    const variantes = gerarVariantesTelefoneBrasileiro('+55 (51) 99352-7271');

    assert.ok(variantes.includes('5551993527271'));
    assert.ok(variantes.includes('51993527271'));
    assert.ok(variantes.includes('555193527271'));
    assert.ok(variantes.includes('5193527271'));
  });

  it('adiciona o nono dígito quando o WhatsApp envia a forma antiga', () => {
    const variantes = gerarVariantesTelefoneBrasileiro('555193527271');

    assert.ok(variantes.includes('5551993527271'));
  });
});
