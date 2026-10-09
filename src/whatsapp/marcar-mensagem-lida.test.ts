/**
 * Testes unitários para marcação de mensagem como lida.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { marcarMensagemLida, type LeitorMensagemWhatsApp } from './marcar-mensagem-lida.js';

test('marca mensagem como lida com parâmetros corretos', async () => {
  let chamadaFeita = false;
  const mockLeitor: LeitorMensagemWhatsApp = {
    async marcarLida(params) {
      chamadaFeita = true;
      assert.equal(params.mensagemId, 'msg-123');
      return { sucesso: true };
    }
  };

  const res = await marcarMensagemLida(mockLeitor, {
    instanciaNome: 'inst-1',
    mensagemId: 'msg-123',
    contatoTelefone: '5511999990000'
  });

  assert.equal(chamadaFeita, true);
  assert.equal(res.sucesso, true);
});

test('retorna erro se faltar parâmetro obrigatório sem disparar chamada', async () => {
  let chamadaFeita = false;
  const mockLeitor: LeitorMensagemWhatsApp = {
    async marcarLida() {
      chamadaFeita = true;
      return { sucesso: true };
    }
  };

  const res = await marcarMensagemLida(mockLeitor, {
    instanciaNome: '',
    mensagemId: 'msg-123',
    contatoTelefone: '5511999990000'
  });

  assert.equal(chamadaFeita, false);
  assert.equal(res.sucesso, false);
});
