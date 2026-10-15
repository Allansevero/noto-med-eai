import assert from 'node:assert/strict';
import test from 'node:test';
import { rotearMidiaWebhook } from './rotear-midia-webhook.js';

test('ignora mensagens enviadas pelo próprio médico/consultório (fromMe)', async () => {
  const r = await rotearMidiaWebhook(
    {
      instanciaNome: 'inst-1',
      medicoId: 'med-1',
      conversaId: 'conv-1',
      mensagemId: 'msg-1',
      telefonePaciente: '5511999999999',
      tipo: 'imagem',
      fromMe: true,
      payloadData: {}
    },
    { geminiClient: {} as any, repositorio: {} as any }
  );

  assert.equal(r, null);
});

test('ignora mensagens do tipo texto', async () => {
  const r = await rotearMidiaWebhook(
    {
      instanciaNome: 'inst-1',
      medicoId: 'med-1',
      conversaId: 'conv-1',
      mensagemId: 'msg-1',
      telefonePaciente: '5511999999999',
      tipo: 'texto',
      fromMe: false,
      payloadData: {}
    },
    { geminiClient: {} as any, repositorio: {} as any }
  );

  assert.equal(r, null);
});

test('processa mídia presente inline no payloadData', async () => {
  let chamadoGemini = false;
  const geminiFalso: any = {
    analisarMidia: async () => {
      chamadoGemini = true;
      return { ehComprovante: false };
    }
  };

  const r = await rotearMidiaWebhook(
    {
      instanciaNome: 'inst-1',
      medicoId: 'med-1',
      conversaId: 'conv-1',
      mensagemId: 'msg-1',
      telefonePaciente: '5511999999999',
      tipo: 'imagem',
      fromMe: false,
      payloadData: {
        message: {
          imageMessage: { base64: 'dados_base64_foto', mimetype: 'image/jpeg' }
        }
      }
    },
    {
      geminiClient: geminiFalso,
      repositorio: {
        buscarCandidatoPorMensagem: async () => null,
        jaExisteFaturamento: async () => false
      } as any
    }
  );

  assert.equal(chamadoGemini, true);
  assert.equal(r?.ok, false);
  assert.equal((r as any)?.motivo, 'nao_eh_comprovante');
});
