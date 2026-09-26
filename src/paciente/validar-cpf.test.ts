import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validarCpf } from './validar-cpf.js';

describe('validarCpf', () => {
  it('deve rejeitar valores nulos, vazios ou indefinidos', () => {
    assert.strictEqual(validarCpf(null), false);
    assert.strictEqual(validarCpf(undefined), false);
    assert.strictEqual(validarCpf(''), false);
  });

  it('deve rejeitar sequências de dígitos repetidos', () => {
    assert.strictEqual(validarCpf('00000000000'), false);
    assert.strictEqual(validarCpf('111.111.111-11'), false);
    assert.strictEqual(validarCpf('99999999999'), false);
  });

  it('deve rejeitar CPFs com dígitos verificadores incorretos', () => {
    assert.strictEqual(validarCpf('529.982.247-24'), false);
    assert.strictEqual(validarCpf('12345678901'), false);
  });

  it('deve validar CPFs legítimos com ou sem máscara', () => {
    // CPFs válidos conhecidos para testes
    assert.strictEqual(validarCpf('529.982.247-25'), true);
    assert.strictEqual(validarCpf('52998224725'), true);
  });
});
