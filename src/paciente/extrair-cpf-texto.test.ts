import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extrairCpfTexto } from './extrair-cpf-texto.js';

describe('extrairCpfTexto', () => {
  it('deve retornar null para texto nulo, vazio ou sem CPF válido', () => {
    assert.strictEqual(extrairCpfTexto(null), null);
    assert.strictEqual(extrairCpfTexto(''), null);
    assert.strictEqual(extrairCpfTexto('Olá doutor, tudo bem?'), null);
  });

  it('não deve confundir número de telefone de 11 dígitos com CPF inválido', () => {
    // 11987654321 é um telefone, não um CPF válido
    assert.strictEqual(extrairCpfTexto('meu telefone é 11987654321'), null);
  });

  it('deve extrair CPF válido formatado de frase natural', () => {
    const texto = 'Boa tarde secretária, meu CPF é 529.982.247-25 para o convênio';
    const cpf = extrairCpfTexto(texto);
    assert.strictEqual(cpf, '52998224725');
  });

  it('deve extrair CPF válido sem formatação de resposta curta', () => {
    const texto = '52998224725';
    const cpf = extrairCpfTexto(texto);
    assert.strictEqual(cpf, '52998224725');
  });
});
