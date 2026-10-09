/**
 * Testes unitários para o AdaptadorRespostaIa.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptadorRespostaIa, type ClienteIa } from './adaptador-resposta-ia.js';

test('realiza exatamente 1 chamada ao cliente de IA por resposta', async () => {
  let totalChamadasIa = 0;
  const mockCliente: ClienteIa = {
    async gerarResposta() {
      totalChamadasIa++;
      return JSON.stringify({
        textoResposta: 'Entendido, Dra. Mariana! Qual é o CRM e Estado?',
        intencaoIdentificada: 'informar_nome'
      });
    }
  };

  const adaptador = new AdaptadorRespostaIa(mockCliente);
  const resp = await adaptador.processarRespostaUnica({
    mensagemUsuario: 'Sou a Dra Mariana Santos',
    historicoRecente: [],
    contexto: { etapaAtual: 'apresentacao', interlocutor: 'medica' }
  });

  assert.equal(totalChamadasIa, 1);
  assert.equal(resp.textoResposta, 'Entendido, Dra. Mariana! Qual é o CRM e Estado?');
  assert.equal(resp.intencaoIdentificada, 'informar_nome');
});

test('tolera resposta em texto puro sem JSON sem quebrar', async () => {
  const mockCliente: ClienteIa = {
    async gerarResposta() {
      return 'Olá! Como posso ajudar hoje?';
    }
  };

  const adaptador = new AdaptadorRespostaIa(mockCliente);
  const resp = await adaptador.processarRespostaUnica({
    mensagemUsuario: 'Oi',
    historicoRecente: [],
    contexto: { etapaAtual: 'apresentacao', interlocutor: 'desconhecido' }
  });

  assert.equal(resp.textoResposta, 'Olá! Como posso ajudar hoje?');
  assert.equal(resp.intencaoIdentificada, undefined);
});
