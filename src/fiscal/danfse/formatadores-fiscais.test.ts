import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatarCpf,
  formatarCnpj,
  formatarTelefone,
  formatarCep,
  resolverNomeMunicipio,
  comporChaveAcessoNacional,
  formatarChaveAcessoEmGruposDe4
} from './formatadores-fiscais.js';

describe('formatadores-fiscais', () => {
  it('deve formatar CPF e CNPJ com máscaras oficiais', () => {
    assert.equal(formatarCpf('52998224725'), '529.982.247-25');
    assert.equal(formatarCnpj('33841732000190'), '33.841.732/0001-90');
    assert.equal(formatarCpf(undefined), '-');
  });

  it('deve formatar telefone com DDD e nono dígito', () => {
    assert.equal(formatarTelefone('51993527271'), '(51) 99352-7271');
    assert.equal(formatarTelefone('5133334444'), '(51) 3333-4444');
  });

  it('deve formatar CEP com hífen', () => {
    assert.equal(formatarCep('90619900'), '90619-900');
  });

  it('deve resolver código IBGE para nome por extenso', () => {
    assert.equal(resolverNomeMunicipio('4314902'), 'PORTO ALEGRE');
    assert.equal(resolverNomeMunicipio('3550308'), 'SÃO PAULO');
  });

  it('deve compor chave de acesso nacional de exatamente 50 dígitos', () => {
    const chave = comporChaveAcessoNacional({
      codIbgeMunicipio: '4314902',
      ambiente: 'producao',
      anoMes: '2026-09',
      cnpjOuCpf: '33841732000190',
      serie: '00001',
      ndps: '1'
    });
    assert.equal(chave.length, 50);
    assert.match(chave, /^\d{50}$/);

    const formatada = formatarChaveAcessoEmGruposDe4(chave);
    assert.equal(formatada.split(' ').length, 13);
  });
});
