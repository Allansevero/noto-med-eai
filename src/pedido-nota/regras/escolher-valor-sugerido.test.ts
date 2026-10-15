import test from 'node:test';
import assert from 'node:assert';
import { escolherValorSugerido, validarValorCentavos } from './escolher-valor-sugerido.js';

test('escolherValorSugerido: prioriza valor informado no texto', () => {
  const v = escolherValorSugerido({
    valorTextoCentavos: 45000,
    valorFonteCentavos: 35000
  });
  assert.strictEqual(v, 45000);
});

test('escolherValorSugerido: adota valor da fonte caso texto não tenha', () => {
  const v = escolherValorSugerido({
    valorFonteCentavos: 35000
  });
  assert.strictEqual(v, 35000);
});

test('escolherValorSugerido: ignora valores fora dos limites (zero ou > R$ 50k)', () => {
  const v1 = escolherValorSugerido({
    valorTextoCentavos: 0,
    valorFonteCentavos: 35000
  });
  assert.strictEqual(v1, 35000);

  const v2 = escolherValorSugerido({
    valorTextoCentavos: 60_000_000 // R$ 600.000,00
  });
  assert.strictEqual(v2, null);
});

test('validarValorCentavos: valida limites', () => {
  assert.strictEqual(validarValorCentavos(100), true);
  assert.strictEqual(validarValorCentavos(99), false);
  assert.strictEqual(validarValorCentavos(5_000_000), true);
  assert.strictEqual(validarValorCentavos(5_000_001), false);
});
