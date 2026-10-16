/**
 * Testes unitários para formatadores de documentos fiscais e moeda.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatarCpf, formatarCnpj, formatarDocumento, formatarMoedaCentavos } from './formatadores-fiscais.js';

describe('Formatadores fiscais em /fiscal', () => {
  it('deve formatar CPF com 11 dígitos', () => {
    assert.equal(formatarCpf('12345678901'), '123.456.789-01');
  });

  it('deve formatar CNPJ com 14 dígitos', () => {
    assert.equal(formatarCnpj('12345678000195'), '12.345.678/0001-95');
  });

  it('deve formatar documento genérico conforme tamanho', () => {
    assert.equal(formatarDocumento('12345678901'), '123.456.789-01');
    assert.equal(formatarDocumento('12345678000195'), '12.345.678/0001-95');
  });

  it('deve formatar centavos em Real brasileiro', () => {
    assert.equal(formatarMoedaCentavos(45000), 'R$ 450,00');
    assert.equal(formatarMoedaCentavos(125050), 'R$ 1.250,50');
  });
});
