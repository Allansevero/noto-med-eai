import { describe, it } from 'node:test';
import assert from 'node:assert';
import { gerarHashOtp, compararHashOtp } from './hash-otp.js';

describe('hash-otp', () => {
  const pepper = 'segredo-de-teste-123';
  const codigo = '123456';

  it('deve gerar hash sha256 em formato hexadecimal de 64 caracteres', () => {
    const hash = gerarHashOtp(codigo, pepper);
    assert.strictEqual(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it('deve gerar hashes diferentes para códigos distintos', () => {
    const hash1 = gerarHashOtp('123456', pepper);
    const hash2 = gerarHashOtp('654321', pepper);
    assert.notStrictEqual(hash1, hash2);
  });

  it('deve gerar hashes diferentes para peppers distintos', () => {
    const hash1 = gerarHashOtp(codigo, 'pepper-a');
    const hash2 = gerarHashOtp(codigo, 'pepper-b');
    assert.notStrictEqual(hash1, hash2);
  });

  it('deve validar com sucesso quando o código e pepper conferem', () => {
    const hash = gerarHashOtp(codigo, pepper);
    const valido = compararHashOtp(codigo, hash, pepper);
    assert.strictEqual(valido, true);
  });

  it('deve rejeitar código incorreto', () => {
    const hash = gerarHashOtp(codigo, pepper);
    const valido = compararHashOtp('000000', hash, pepper);
    assert.strictEqual(valido, false);
  });

  it('deve rejeitar hash com tamanho incompatível sem disparar exceção', () => {
    const valido = compararHashOtp(codigo, 'hash-curto-invalido', pepper);
    assert.strictEqual(valido, false);
  });
});
