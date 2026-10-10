/**
 * Testes unitários do agente decisor de responsabilidade de falhas (desenvolvedor vs usuário).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decidirResponsabilidadeFalha } from './decidir-responsabilidade-falha.js';
import type { FalhaEmissao } from './investigacao.js';

test('atribui ao desenvolvedor falha de FORA_DA_VIGENCIA', () => {
  const falha: FalhaEmissao = {
    sucesso: false,
    erro: 'Há parâmetros fiscais pendentes de revisão antes do envio.',
    pendenciasFiscais: [
      { campo: 'vigencia', codigo: 'FORA_DA_VIGENCIA', mensagem: 'Revisar os parâmetros aplicáveis à competência da nota.' }
    ]
  };
  const d = decidirResponsabilidadeFalha(falha);
  assert.equal(d.responsavel, 'desenvolvedor');
  assert.equal(d.categoria, 'sistema');
  assert.match(d.motivo, /vigência/i);
});

test('atribui ao desenvolvedor falhas estruturais internas do sistema', () => {
  for (const codigo of ['PARAMETRO_INVALIDO', 'CONFIGURACAO_INVALIDA', 'SERVICO_AMBIGUO', 'CLASSIFICACAO_DIVERGENTE']) {
    const falha: FalhaEmissao = {
      sucesso: false,
      erro: 'Inconsistência interna.',
      pendenciasFiscais: [{ campo: 'servico', codigo, mensagem: 'Erro' }]
    };
    const d = decidirResponsabilidadeFalha(falha);
    assert.equal(d.responsavel, 'desenvolvedor');
    assert.equal(d.categoria, 'sistema');
  }
});

test('atribui ao desenvolvedor falhas de infraestrutura DNS/conexão ou SEFIN 500', () => {
  const falhaDns: FalhaEmissao = {
    sucesso: false,
    erro: 'DNS failure',
    falhaAntesDoEnvio: 'EAI_AGAIN'
  };
  assert.equal(decidirResponsabilidadeFalha(falhaDns).responsavel, 'desenvolvedor');

  const falha500: FalhaEmissao = {
    sucesso: false,
    erro: 'Internal Server Error',
    httpStatus: 500
  };
  assert.equal(decidirResponsabilidadeFalha(falha500).responsavel, 'desenvolvedor');
});

test('atribui ao usuário dados profissionais pendentes (CRM/Nome)', () => {
  const falha: FalhaEmissao = {
    sucesso: false,
    erro: 'Informe nome completo e CRM para emitir suas notas.',
    dadosProfissionaisPendentes: true
  };
  const d = decidirResponsabilidadeFalha(falha);
  assert.equal(d.responsavel, 'usuario');
  assert.equal(d.categoria, 'dados_medico');
});

test('atribui ao usuário pendências cadastrais do município como E0116 ou E0160', () => {
  const falha: FalhaEmissao = {
    sucesso: false,
    erro: 'Inscrição municipal não encontrada.',
    codigoErroSefin: 'E0116'
  };
  const d = decidirResponsabilidadeFalha(falha);
  assert.equal(d.responsavel, 'usuario');
  assert.equal(d.categoria, 'cadastro_fiscal');
});

test('atribui ao usuário valor do serviço inválido', () => {
  const falha: FalhaEmissao = {
    sucesso: false,
    erro: 'Valor inválido.',
    pendenciasFiscais: [{ campo: 'valor', codigo: 'VALOR_INVALIDO', mensagem: 'Valor zerado' }]
  };
  const d = decidirResponsabilidadeFalha(falha);
  assert.equal(d.responsavel, 'usuario');
  assert.equal(d.categoria, 'dados_paciente');
});
