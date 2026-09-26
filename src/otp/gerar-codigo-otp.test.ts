import { describe, it } from 'node:test';
import assert from 'node:assert';
import { gerarCodigoOtp } from './gerar-codigo-otp.js';

describe('gerarCodigoOtp', () => {
  it('deve gerar código com 6 dígitos por padrão', () => {
    const codigo = gerarCodigoOtp();
    assert.strictEqual(codigo.length, 6);
    assert.match(codigo, /^\d{6}$/);
  });

  it('deve respeitar tamanho customizado se fornecido', () => {
    const codigo4 = gerarCodigoOtp(4);
    assert.strictEqual(codigo4.length, 4);
    assert.match(codigo4, /^\d{4}$/);
  });

  it('deve gerar códigos aleatórios diferentes em chamadas consecutivas', () => {
    const codigos = new Set(Array.from({ length: 20 }, () => gerarCodigoOtp()));
    assert.ok(codigos.size > 1);
  });
});
