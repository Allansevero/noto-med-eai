import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extrairValorMoedaCentavos } from './extrair-valor-moeda.js';

describe('extrairValorMoedaCentavos', () => {
  it('deve retornar null para texto nulo, indefinido ou vazio', () => {
    assert.strictEqual(extrairValorMoedaCentavos(null), null);
    assert.strictEqual(extrairValorMoedaCentavos(undefined), null);
    assert.strictEqual(extrairValorMoedaCentavos(''), null);
    assert.strictEqual(extrairValorMoedaCentavos('apenas texto sem valor'), null);
  });

  it('deve converter valores inteiros em centavos', () => {
    assert.strictEqual(extrairValorMoedaCentavos('350'), 35000);
    assert.strictEqual(extrairValorMoedaCentavos('R$ 500'), 50000);
  });

  it('deve converter valores decimais com vírgula padrão BRL', () => {
    assert.strictEqual(extrairValorMoedaCentavos('350,00'), 35000);
    assert.strictEqual(extrairValorMoedaCentavos('R$ 450,50'), 45050);
  });

  it('deve extrair valor corretamente mesmo quando houver datas no texto', () => {
    assert.strictEqual(extrairValorMoedaCentavos('25/09 350'), 35000);
    assert.strictEqual(extrairValorMoedaCentavos('consulta de 25/09 valor 400'), 40000);
    assert.strictEqual(extrairValorMoedaCentavos('350 da consulta de 15/08/2026'), 35000);
  });
});
