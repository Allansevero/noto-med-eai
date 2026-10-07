import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nomeProfissionalValido, normalizarCrm, dadosProfissionaisCompletos, interpretarRespostaProfissional } from './validar-dados-emissao.js';
test('nome completo exige identidade real e admite títulos e acentos', () => {
  for (const nome of [null, '', 'Ana', 'Médico 9886', 'João 123', 'null', 'sem nome', 'Nome completo', 'preciso emitir nota']) assert.equal(nomeProfissionalValido(nome), false, String(nome));
  for (const nome of ['Ana Maria Silva', 'Dr. João D’Ávila', 'Dra. Ana Souza']) assert.equal(nomeProfissionalValido(nome), true);
});
test('CRM exige números e UF brasileira quando informada', () => {
  assert.equal(normalizarCrm(' CRM: 12345 - rs '), '12345/RS');
  assert.equal(normalizarCrm('12345'), '12345');
  for (const crm of [null, '', 'CRM', '123/XX', 'abc123', '00000', '123/']) assert.equal(normalizarCrm(crm), null);
  assert.equal(dadosProfissionaisCompletos({nomeCompleto:'Ana Maria',crm:'123/RS'}), true);
  assert.equal(dadosProfissionaisCompletos({nomeCompleto:'Médico 9886',crm:'123/RS'}), false);
});
test('resposta só coleta campos explícitos faltantes ou a etapa sequencial esperada', () => {
  assert.deepEqual(interpretarRespostaProfissional('Nome completo: Ana Silva\nCRM: 12345/RS\nRQE: 987', {nomeCompleto:'Médico 9886',crm:null}), {nome:'Ana Silva',crm:'12345/RS',rqe:'987'});
  assert.deepEqual(interpretarRespostaProfissional('Ana Silva', {nomeCompleto:'Médico 9886',crm:null}), {nome:'Ana Silva'});
  assert.deepEqual(interpretarRespostaProfissional('12345/RS', {nomeCompleto:'Ana Silva',crm:null}), {crm:'12345/RS'});
  assert.deepEqual(interpretarRespostaProfissional('Nome completo: Outro Nome\nCRM: 555/RS', {nomeCompleto:'Ana Silva',crm:'123/SP'}), {});
  assert.deepEqual(interpretarRespostaProfissional('emita para Ana Silva CPF 12345', {nomeCompleto:null,crm:null}), {});
});
