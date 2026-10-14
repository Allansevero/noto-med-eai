import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { redigirMensagemBoasVindasConexao } from './redigir-mensagem-boas-vindas-conexao.js';

describe('redigirMensagemBoasVindasConexao', () => {
  test('deve redigir mensagem com nome do médico quando disponível', () => {
    const texto = redigirMensagemBoasVindasConexao('Dra. Bruna Botter');
    assert.match(texto, /^Oi, Dr\(a\)\. Bruna!/);
    assert.match(texto, /Sou o Noto e vou cuidar da emissão das suas notas fiscais/);
    assert.match(texto, /organizando e mapeando o histórico dos seus pacientes/);
    assert.match(texto, /Não precisa me enviar nada agora/);
  });

  test('deve usar Oi genérico quando médico não tiver nome preenchido', () => {
    const texto = redigirMensagemBoasVindasConexao(null);
    assert.match(texto, /^Oi!/);
    assert.match(texto, /Sou o Noto e vou cuidar da emissão das suas notas fiscais/);
  });
});
