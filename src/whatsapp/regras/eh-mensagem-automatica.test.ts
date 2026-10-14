import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { ehMensagemAutomatica } from './eh-mensagem-automatica.js';

describe('ehMensagemAutomatica', () => {
  test('deve identificar mensagens de ausência com horário de atendimento', () => {
    const msg = 'Olá! Agradecemos sua mensagem. No momento estamos ausentes. Nosso horário de atendimento é de segunda a sexta, das 8h às 18h. Em breve responderemos!';
    assert.equal(ehMensagemAutomatica(msg), true);
  });

  test('deve identificar mensagens de agradecimento com retorno em breve', () => {
    const msg = 'Obrigado por entrar em contato! Em breve retornaremos sua mensagem.';
    assert.equal(ehMensagemAutomatica(msg), true);
  });

  test('deve identificar mensagens explícitas de robô ou mensagem automática', () => {
    const msg = 'Esta é uma mensagem automática, por favor não responda a este número.';
    assert.equal(ehMensagemAutomatica(msg), true);
  });

  test('deve identificar menus numéricos de boas-vindas da clínica', () => {
    const msg = 'Olá! Seja bem-vindo à Clínica Saúde. Escolha uma das opções:\n1 - Agendamento\n2 - Informações';
    assert.equal(ehMensagemAutomatica(msg), true);
  });

  test('NÃO deve classificar respostas reais do médico como automáticas', () => {
    assert.equal(ehMensagemAutomatica('Sim, pode emitir a nota'), false);
    assert.equal(ehMensagemAutomatica('Pode sim'), false);
    assert.equal(ehMensagemAutomatica('Não, cancela'), false);
    assert.equal(ehMensagemAutomatica('123.456.789-00'), false);
    assert.equal(ehMensagemAutomatica('O CPF da paciente é 05488899912'), false);
    assert.equal(ehMensagemAutomatica('Tem notas para hoje?'), false);
    assert.equal(ehMensagemAutomatica('ok'), false);
    assert.equal(ehMensagemAutomatica('beleza'), false);
    assert.equal(ehMensagemAutomatica(''), false);
    assert.equal(ehMensagemAutomatica(null), false);
  });
});
