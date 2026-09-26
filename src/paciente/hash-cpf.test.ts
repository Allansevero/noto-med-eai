import { describe, it } from 'node:test';
import assert from 'node:assert';
import { gerarHashCpf } from './hash-cpf.js';

describe('gerarHashCpf', () => {
  const pepper = 'pepper-cpf-secreto-app';
  const cpfFormatado = '529.982.247-25';
  const cpfLimpo = '52998224725';

  it('deve gerar mesmo hash para CPF com ou sem formatação', () => {
    const hash1 = gerarHashCpf(cpfFormatado, pepper);
    const hash2 = gerarHashCpf(cpfLimpo, pepper);

    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64);
  });

  it('deve gerar hashes distintos para peppers diferentes', () => {
    const hashA = gerarHashCpf(cpfLimpo, 'pepper-a');
    const hashB = gerarHashCpf(cpfLimpo, 'pepper-b');

    assert.notStrictEqual(hashA, hashB);
  });

  it('deve gerar hashes distintos para CPFs diferentes', () => {
    const hash1 = gerarHashCpf('52998224725', pepper);
    const hash2 = gerarHashCpf('11144477735', pepper);

    assert.notStrictEqual(hash1, hash2);
  });
});
