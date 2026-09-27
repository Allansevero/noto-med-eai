import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferirEspecialidadeDeXdescserv } from './inferir-especialidade-de-xdescserv.js';

describe('inferirEspecialidadeDeXdescserv', () => {
  it('deve inferir Psiquiatria de "REFERENTE 1 CONSULTA EM PSIQUIATRA..."', () => {
    const texto = 'REFERENTE 1 CONSULTA EM PSIQUIATRA COM DR(A) FULANO';
    assert.equal(inferirEspecialidadeDeXdescserv(texto), 'Psiquiatria');
  });

  it('deve inferir Dermatologia com acentuação ou minúsculas', () => {
    assert.equal(inferirEspecialidadeDeXdescserv('Atendimento em dermatologia clínica'), 'Dermatologia');
  });

  it('deve retornar null se não encontrar termo conhecido', () => {
    assert.equal(inferirEspecialidadeDeXdescserv('Prestação de serviços médicos diversos'), null);
    assert.equal(inferirEspecialidadeDeXdescserv(null), null);
  });
});
