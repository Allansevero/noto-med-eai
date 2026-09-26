import { describe, it } from 'node:test';
import assert from 'node:assert';
import { calcularValorEmissao } from './calcular-valor-emissao.js';

describe('calcularValorEmissao', () => {
  it('deve priorizar valor digitado pelo médico', () => {
    const res = calcularValorEmissao(45000, [30000, 30000]);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.valorCentavos, 45000);
    assert.strictEqual(res.origemValor, 'digitado');
  });

  it('deve rejeitar valor digitado inválido menor ou igual a zero', () => {
    const res = calcularValorEmissao(0);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.motivo, 'valor_invalido');
  });

  it('deve somar consultas em aberto quando o médico não digitar valor', () => {
    const res = calcularValorEmissao(null, [25000, 30000, null, 15000]);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.valorCentavos, 70000);
    assert.strictEqual(res.origemValor, 'soma_consultas');
  });

  it('deve retornar valor_indisponivel quando não houver valor digitado nem consultas com valor', () => {
    const res = calcularValorEmissao(null, [null, undefined, 0]);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.motivo, 'valor_indisponivel');
  });
});
