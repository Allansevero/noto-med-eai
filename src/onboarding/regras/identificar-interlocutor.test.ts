/**
 * Testes unitários para identificação de interlocutor (Secretária x Médica).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { identificarInterlocutor } from './identificar-interlocutor.js';

test('identifica secretária que se apresenta pelo nome', () => {
  const res = 'Olá, sou a secretária Carla e gostaria de configurar as notas da Dra. Helena';
  const resultado = identificarInterlocutor(res);

  assert.equal(resultado.papel, 'secretaria');
  assert.equal(resultado.ehApresentacaoSecretaria, true);
  assert.equal(resultado.nomeInformado, 'Carla');
});

test('apresentação da secretária não define o papel como médica', () => {
  const res = 'Sou secretária aqui no consultório';
  const resultado = identificarInterlocutor(res);

  assert.equal(resultado.papel, 'secretaria');
  assert.equal(resultado.ehApresentacaoSecretaria, true);
});

test('identifica médica se apresentando diretamente', () => {
  const res = 'Olá, sou a Dra. Mariana Silva';
  const resultado = identificarInterlocutor(res);

  assert.equal(resultado.papel, 'medica');
  assert.equal(resultado.ehApresentacaoSecretaria, false);
  assert.equal(resultado.nomeInformado, 'Mariana Silva');
});

test('marca como desconhecido quando mensagem não especifica papel', () => {
  const res = 'Bom dia, quero emitir uma nota fiscal';
  const resultado = identificarInterlocutor(res);

  assert.equal(resultado.papel, 'desconhecido');
  assert.equal(resultado.ehApresentacaoSecretaria, false);
});
