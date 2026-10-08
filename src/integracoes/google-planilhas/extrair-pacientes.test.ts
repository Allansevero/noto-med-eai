import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extrairPacientesPlanilha } from './extrair-pacientes.js';
import type { MapaColunasPlanilha } from './types.js';

const mapa: MapaColunasPlanilha = { nome: 0, cpf: 1, email: 2, telefone: 3 };
const mapeador = { async mapear() { return mapa; } };

describe('extrairPacientesPlanilha', () => {
  it('encontra cabeçalho após títulos e extrai células sem enviar pacientes à IA', async () => {
    let enviados: string[] = [];
    const resultado = await extrairPacientesPlanilha([
      ['Lista de pacientes'], [], ['Nome completo', 'CPF', 'E-mail', 'WhatsApp', 'Segredo Paciente'],
      ['  Ana Silva  ', '529.982.247-25', 'Ana@Example.com', '(11) 99999-1234', 'diagnóstico'], [],
    ], { async mapear(cabecalho) { enviados = cabecalho; return mapa; } }, true);
    assert.deepEqual(enviados, ['Nome completo', 'CPF', 'E-mail', 'WhatsApp', '']);
    assert.deepEqual(resultado.pacientes, [{ linha: 4, nome: 'Ana Silva', cpf: '52998224725', email: 'Ana@Example.com', telefone: '5511999991234', pendencias: [] }]);
    assert.equal(resultado.cabecalhoLinha, 3);
    assert.equal(resultado.linhasLidas, 2);
    assert.equal(resultado.limitado, true);
  });
  it('rejeita cabeçalho ausente ou após a décima linha sem invocar IA', async () => {
    const proibido = { async mapear(): Promise<MapaColunasPlanilha> { assert.fail('Não deve enviar células'); } };
    await assert.rejects(extrairPacientesPlanilha([['Ana', '52998224725']], proibido, false), /cabeçalho/i);
    await assert.rejects(extrairPacientesPlanilha([...Array.from({ length: 10 }, () => ['Relatório']), ['CPF']], proibido, false), /cabeçalho/i);
  });
  it('aceita CPF sozinho e marca ausência do telefone obrigatório', async () => {
    const resultado = await extrairPacientesPlanilha([['CPF'], ['52998224725']], { async mapear() { return { nome: null, cpf: 0, email: null, telefone: null }; } }, false);
    assert.equal(resultado.pacientes[0].cpf, '52998224725');
    assert.deepEqual(resultado.pacientes[0].pendencias, ['telefone_ausente']);
  });
  it('não inventa dígitos e rejeita CPF, email e telefone inválidos', async () => {
    const resultado = await extrairPacientesPlanilha([['Nome', 'CPF', 'Email', 'Telefone'], ['Ana', '12345678901', 'email inválido', '111'], ['Bia', '', '', '']], mapeador, false);
    assert.deepEqual(resultado.pacientes[0], { linha: 2, nome: 'Ana', cpf: null, email: null, telefone: null, pendencias: ['cpf_invalido', 'email_invalido', 'telefone_invalido'] });
    assert.deepEqual(resultado.pacientes[1].pendencias, ['telefone_ausente']);
  });
  it('não corta campos excessivos e marca o erro', async () => {
    const resultado = await extrairPacientesPlanilha([['Nome', 'CPF', 'Email', 'Telefone'], ['a'.repeat(201), '', 'a'.repeat(260) + '@a.com', '+55 11 99999-1234']], mapeador, false);
    assert.equal(resultado.pacientes[0].nome, null);
    assert.equal(resultado.pacientes[0].email, null);
    assert.deepEqual(resultado.pacientes[0].pendencias, ['nome_invalido', 'email_invalido']);
  });
  it('marca ambas as linhas de um telefone com CPFs conflitantes', async () => {
    const resultado = await extrairPacientesPlanilha([['Nome', 'CPF', 'Email', 'Telefone'], ['Ana', '52998224725', '', '11999991234'], ['Bia', '11144477735', '', '5511999991234']], mapeador, false);
    assert.equal(resultado.pacientes.length, 2);
    for (const paciente of resultado.pacientes) assert.ok(paciente.pendencias.includes('telefone_cpf_conflitante'));
  });
  it('marca todas as linhas de um CPF com telefones distintos sem escolher a primeira', async () => {
    const resultado = await extrairPacientesPlanilha([
      ['Nome', 'CPF', 'Email', 'Telefone'],
      ['Ana', '52998224725', '', '11999991234'],
      ['Ana', '529.982.247-25', '', '21988881234'],
      ['Ana', '52998224725', '', ''],
      ['Bia', '11144477735', '', '11999991234'],
    ], mapeador, false);
    assert.equal(resultado.pacientes.length, 4);
    for (const paciente of resultado.pacientes.slice(0, 3)) assert.ok(paciente.pendencias.includes('cpf_telefones_conflitantes'));
    assert.ok(resultado.pacientes[0].pendencias.includes('telefone_cpf_conflitante'));
    assert.ok(resultado.pacientes[3].pendencias.includes('telefone_cpf_conflitante'));
    assert.ok(!resultado.pacientes[3].pendencias.includes('cpf_telefones_conflitantes'));
  });

  it('usa Contatos reconhecido quando a IA omite o telefone e preserva nome e CPF', async () => {
    const resultado = await extrairPacientesPlanilha([
      ['Nome completo', 'CPF', 'Contatos'],
      ['Ana Silva', '52998224725', '48999991234'],
    ], { async mapear() { return { nome: 0, cpf: 1, email: null, telefone: null }; } }, false);
    assert.equal(resultado.colunas.telefone, 2);
    assert.deepEqual(resultado.pacientes[0], {
      linha: 2, nome: 'Ana Silva', cpf: '52998224725', email: null,
      telefone: '5548999991234', pendencias: [],
    });
  });
  it('completa colunas únicas reconhecidas mesmo com todos os campos omitidos pela IA', async () => {
    const resultado = await extrairPacientesPlanilha([
      ['Nome completo', 'CPF', 'E-mail', 'Contato'],
      ['Ana Silva', '52998224725', 'ana@example.com', '+55 (48) 99999-1234'],
    ], { async mapear() { return { nome: null, cpf: null, email: null, telefone: null }; } }, false);
    assert.deepEqual(resultado.colunas, mapa);
    assert.deepEqual(resultado.pacientes[0].pendencias, []);
    assert.equal(resultado.pacientes[0].telefone, '5548999991234');
  });
  it('não escolhe entre duas colunas de contato omitidas pela IA', async () => {
    const resultado = await extrairPacientesPlanilha([
      ['Nome', 'CPF', 'Contatos', 'WhatsApp'],
      ['Ana Silva', '52998224725', '48999991234', '11999991234'],
    ], { async mapear() { return { nome: 0, cpf: 1, email: null, telefone: null }; } }, false);
    assert.equal(resultado.colunas.telefone, null);
    assert.deepEqual(resultado.pacientes[0].pendencias, ['telefone_ausente']);
  });

  for (const invalido of [
    { ...mapa, telefone: 99 }, { ...mapa, cpf: 0 }, { ...mapa, telefone: -1 },
    { ...mapa, telefone: 1.5 }, { ...mapa, cpf: 3, telefone: 1 },
    { ...mapa, inventado: 'paciente' },
  ]) it(`rejeita mapa inseguro ${JSON.stringify(invalido)}`, async () => {
    await assert.rejects(extrairPacientesPlanilha([['Nome', 'CPF', 'Email', 'Telefone'], ['Ana']], { async mapear() { return invalido; } }, false), /colunas/i);
  });
});
