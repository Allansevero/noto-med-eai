/**
 * Testes unitários para extração e validação do nome da médica.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairNomeMedicaResposta } from './extrair-nome-medica-resposta.js';

test('extrai nome completo quando pergunta atual é nome_medica', () => {
  const resultado = extrairNomeMedicaResposta('Dra. Juliana Pereira Santos', {
    perguntaAtual: 'nome_medica',
    ehApresentacaoSecretaria: false
  });

  assert.equal(resultado.valido, true);
  assert.equal(resultado.nomeExtraido, 'Juliana Pereira Santos');
});

test('rejeita preenchimento do nome da médica quando a pergunta atual é outra (ex: crm_rqe)', () => {
  const resultado = extrairNomeMedicaResposta('Juliana Pereira', {
    perguntaAtual: 'crm_rqe',
    ehApresentacaoSecretaria: false
  });

  assert.equal(resultado.valido, false);
  assert.equal(resultado.motivoInvalido, 'pergunta_diferente');
});

test('rejeita preenchimento do nome da médica se for mensagem de apresentação da secretária', () => {
  const resultado = extrairNomeMedicaResposta('Carla Souza', {
    perguntaAtual: 'nome_medica',
    ehApresentacaoSecretaria: true
  });

  assert.equal(resultado.valido, false);
  assert.equal(resultado.motivoInvalido, 'apresentacao_secretaria');
});

test('rejeita nome de apenas 1 palavra', () => {
  const resultado = extrairNomeMedicaResposta('Juliana', {
    perguntaAtual: 'nome_medica',
    ehApresentacaoSecretaria: false
  });

  assert.equal(resultado.valido, false);
  assert.equal(resultado.motivoInvalido, 'nome_muito_curto');
});
