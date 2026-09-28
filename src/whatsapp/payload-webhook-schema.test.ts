import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  webhookEvolutionSchema,
  extrairTextoMensagem,
  type DadosMensagemEvolution
} from './payload-webhook-schema.js';
import {
  ehEventoSincronizacaoAuxiliar,
  extrairPayloadHistorico
} from './payload-historico-webhook-schema.js';

describe('payload-webhook-schema', () => {
  it('deve validar payload completo de webhook com sucesso', () => {
    const payload = {
      event: 'messages.upsert',
      instance: 'dr_joao_consultorio',
      data: {
        key: {
          remoteJid: '5511999998888@s.whatsapp.net',
          fromMe: true,
          id: 'MSG-12345'
        },
        pushName: 'Dr. João',
        message: {
          conversation: 'Consulta agendada!'
        },
        messageTimestamp: 1727361600
      }
    };

    const resultado = webhookEvolutionSchema.safeParse(payload);
    assert.strictEqual(resultado.success, true);
  });

  it('deve rejeitar payload sem campos obrigatórios', () => {
    const payloadInvalido = {
      event: 'messages.upsert',
      instance: ''
    };

    const resultado = webhookEvolutionSchema.safeParse(payloadInvalido);
    assert.strictEqual(resultado.success, false);
  });

  it('deve extrair texto de conversation simples', () => {
    const dados: DadosMensagemEvolution = {
      key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: '1' },
      message: { conversation: '  Olá doutor  ' }
    };

    assert.strictEqual(extrairTextoMensagem(dados), 'Olá doutor');
  });

  it('deve extrair texto de extendedTextMessage', () => {
    const dados: DadosMensagemEvolution = {
      key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: true, id: '2' },
      message: {
        extendedTextMessage: { text: 'Vou enviar em instantes sua NF no valor de R$ 350,00' }
      }
    };

    assert.strictEqual(
      extrairTextoMensagem(dados),
      'Vou enviar em instantes sua NF no valor de R$ 350,00'
    );
  });

  it('deve retornar null se a mensagem não tiver conteúdo textual', () => {
    const dados: DadosMensagemEvolution = {
      key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: '3' },
      message: {}
    };

    assert.strictEqual(extrairTextoMensagem(dados), null);
  });

  it('deve normalizar lote de histórico recebido em data.messages', () => {
    const payload = {
      event: 'messages.set',
      instance: 'dr_joao_consultorio',
      data: {
        messages: [{
          key: {
            remoteJid: '5511999998888@s.whatsapp.net',
            fromMe: false,
            id: 'HIST-1'
          },
          message: { conversation: 'Meu CPF é 529.982.247-25' }
        }],
        isLatest: true,
        progress: 100
      }
    };

    const resultado = extrairPayloadHistorico(payload);
    assert.strictEqual(resultado?.instance, 'dr_joao_consultorio');
    assert.strictEqual(resultado?.mensagens.length, 1);
  });

  it('deve reconhecer eventos auxiliares de contatos e conversas', () => {
    assert.strictEqual(ehEventoSincronizacaoAuxiliar({ event: 'CHATS_SET' }), true);
    assert.strictEqual(ehEventoSincronizacaoAuxiliar({ event: 'contacts.set' }), true);
    assert.strictEqual(ehEventoSincronizacaoAuxiliar({ event: 'messages.upsert' }), false);
  });
});
