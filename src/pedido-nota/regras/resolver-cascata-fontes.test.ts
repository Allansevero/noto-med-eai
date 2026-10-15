import test from 'node:test';
import assert from 'node:assert';
import { resolverCascataFontes } from './resolver-cascata-fontes.js';
import type { PacienteEncontrado } from '../tipos.js';

test('resolverCascataFontes: para na primeira fonte com 1 resultado', () => {
  const p1: PacienteEncontrado = {
    nome: 'Antônio Marques',
    origem: 'supabase',
    telefone: '51998124521'
  };

  const res = resolverCascataFontes([
    { fonte: 'supabase', pacientes: [p1] },
    { fonte: 'sheets', pacientes: [] }
  ]);

  assert.strictEqual(res.tipo, 'unico');
  if (res.tipo === 'unico') {
    assert.strictEqual(res.paciente.nome, 'Antônio Marques');
  }
});

test('resolverCascataFontes: avança para a próxima se a anterior estiver vazia', () => {
  const p2: PacienteEncontrado = {
    nome: 'Maria da Silva',
    origem: 'conversa',
    telefone: '11988887777'
  };

  const res = resolverCascataFontes([
    { fonte: 'supabase', pacientes: [] },
    { fonte: 'sheets', pacientes: [] },
    { fonte: 'conversa', pacientes: [p2] }
  ]);

  assert.strictEqual(res.tipo, 'unico');
  if (res.tipo === 'unico') {
    assert.strictEqual(res.paciente.origem, 'conversa');
  }
});

test('resolverCascataFontes: detecta múltiplos e não desce para a próxima', () => {
  const p1: PacienteEncontrado = { nome: 'João Pedro', origem: 'supabase', telefone: '11999991111' };
  const p2: PacienteEncontrado = { nome: 'João Pedro Júnior', origem: 'supabase', telefone: '11999992222' };

  const res = resolverCascataFontes([
    { fonte: 'supabase', pacientes: [p1, p2] },
    { fonte: 'conversa', pacientes: [{ nome: 'João Pedro', origem: 'conversa', telefone: '11999991111' }] }
  ]);

  assert.strictEqual(res.tipo, 'multiplos');
  if (res.tipo === 'multiplos') {
    assert.strictEqual(res.opcoes.length, 2);
    assert.strictEqual(res.fonte, 'supabase');
  }
});

test('resolverCascataFontes: retorna nenhum se todas estiverem vazias', () => {
  const res = resolverCascataFontes([
    { fonte: 'supabase', pacientes: [] },
    { fonte: 'sheets', pacientes: [] },
    { fonte: 'conversa', pacientes: [] }
  ]);

  assert.strictEqual(res.tipo, 'nenhum');
});
