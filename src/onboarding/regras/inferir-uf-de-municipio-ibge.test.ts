import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferirUfDeMunicipioIbge } from './inferir-uf-de-municipio-ibge.js';

describe('inferirUfDeMunicipioIbge', () => {
  it('deve inferir RS para o código 4300406 (Alegrete)', () => {
    assert.equal(inferirUfDeMunicipioIbge('4300406'), 'RS');
  });

  it('deve inferir SP para o código 3550308 (São Paulo)', () => {
    assert.equal(inferirUfDeMunicipioIbge('3550308'), 'SP');
  });

  it('deve retornar null para código inválido ou vazio', () => {
    assert.equal(inferirUfDeMunicipioIbge(''), null);
    assert.equal(inferirUfDeMunicipioIbge('9999999'), null);
  });
});
