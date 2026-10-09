/**
 * Testes unitários para validar-protecao-fiscal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { validarProtecaoFiscal, type DadosValidacaoEmissao } from './validar-protecao-fiscal.js';

test('Proteção Fiscal - Bloqueia emissão se identidade da médica for pendente mesmo com CRM e Nome preenchidos', () => {
  const dados: DadosValidacaoEmissao = {
    identidadeMedicaConfirmada: false, // <-- Pendente!
    statusCadastro: 'confirmado',
    medica: {
      nome: 'Dra. Ana Silva',
      crm: '123456',
      ufCrm: 'SP'
    }
  };

  const resultado = validarProtecaoFiscal(dados);
  assert.equal(resultado.podeTransmitir, false);
  if (!resultado.podeTransmitir) {
    assert.equal(resultado.motivo, 'identidade_pendente');
  }
});

test('Proteção Fiscal - Bloqueia emissão se cadastro não estiver confirmado', () => {
  const dados: DadosValidacaoEmissao = {
    identidadeMedicaConfirmada: true,
    statusCadastro: 'em_analise',
    medica: {
      nome: 'Dra. Ana Silva',
      crm: '123456',
      ufCrm: 'SP'
    }
  };

  const resultado = validarProtecaoFiscal(dados);
  assert.equal(resultado.podeTransmitir, false);
  if (!resultado.podeTransmitir) {
    assert.equal(resultado.motivo, 'cadastro_incompleto');
  }
});

test('Proteção Fiscal - Bloqueia emissão se secretária estiver com vínculo inativo', () => {
  const dados: DadosValidacaoEmissao = {
    identidadeMedicaConfirmada: true,
    statusCadastro: 'confirmado',
    medica: {
      nome: 'Dra. Ana Silva',
      crm: '123456',
      ufCrm: 'SP'
    },
    secretariaVinculada: {
      id: 'sec-99',
      ativa: false
    }
  };

  const resultado = validarProtecaoFiscal(dados);
  assert.equal(resultado.podeTransmitir, false);
  if (!resultado.podeTransmitir) {
    assert.equal(resultado.motivo, 'vinculo_secretaria_invalido');
  }
});

test('Proteção Fiscal - Libera transmissão quando todos os requisitos estão confirmados', () => {
  const dados: DadosValidacaoEmissao = {
    identidadeMedicaConfirmada: true,
    statusCadastro: 'confirmado',
    medica: {
      nome: 'Dra. Ana Silva',
      crm: '123456',
      ufCrm: 'SP'
    },
    secretariaVinculada: {
      id: 'sec-01',
      ativa: true
    }
  };

  const resultado = validarProtecaoFiscal(dados);
  assert.equal(resultado.podeTransmitir, true);
});
