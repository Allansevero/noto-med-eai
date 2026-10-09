import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processarMensagemWebhook } from './processar-mensagem-webhook.js';
test('oficial é somente OTP: ignora mensagens e histórico sem banco, IA ou respostas', async () => {
  const proibido = async () => {
    throw Error('não acessar fluxo de conversa');
  };
  const deps: any = {
    segredoConfigurado: 'segredo',
    instanciaOficialNome: 'oficial',
    instanciaAssistenteNome: 'assistente',
    repositorio: {
      buscarInstanciaPorNome: proibido,
      buscarMedicoPorTelefone: proibido
    },
    dadosProfissionais: { processarResposta: proibido },
    comunicadorNoto: { enviar: proibido },
    enviarMensagemPaciente: { enviarTexto: proibido }
  };
  for (const fromMe of [false, true]) {
    const r = await processarMensagemWebhook(
      {
        event: 'messages.upsert',
        instance: 'oficial',
        data: {
          key: { id: 'm1', fromMe, remoteJid: '5511999991234@s.whatsapp.net' },
          message: { conversation: 'Meu nome é Roberto Santos, CRM 12345/RS' }
        }
      },
      'segredo',
      deps
    );
    assert.equal(r.ok && r.acao, 'descartada');
  }
  assert.equal(
    (
      await processarMensagemWebhook(
        { event: 'messages.set', instance: 'oficial', data: [] },
        'segredo',
        deps
      )
    ).ok,
    true
  );
});
