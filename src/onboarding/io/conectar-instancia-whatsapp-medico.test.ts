import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { conectarInstanciaWhatsappMedico } from './conectar-instancia-whatsapp-medico.js';

describe('conectarInstanciaWhatsappMedico', () => {
  it('deve gerar nome de instância seguro e salvar no banco', async () => {
    const fetchOriginal = globalThis.fetch;
    const chamadas: Array<{ url: string; body?: any }> = [];
    const executedQueries: any[] = [];
    const mockPool = {
      query: async (sql: string, values: any[]) => {
        executedQueries.push({ sql, values });
        return { rows: [{ id: 'inst-123' }] };
      }
    } as any;

    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });
      if (String(url).includes('/instance/create')) {
        return new Response(JSON.stringify({ qrcode: { base64: 'abc' } }), { status: 201 });
      }
      if (String(url).includes('/settings/find/')) {
        return new Response(JSON.stringify({
          reject_call: true,
          msg_call: 'Não posso atender agora.',
          groups_ignore: false,
          always_online: true,
          read_messages: true,
          read_status: false,
          sync_full_history: false
        }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    };

    try {
      const res = await conectarInstanciaWhatsappMedico(mockPool, {
        medicoId: 'e20790d9-b541-4712-a7d0-7e3fbe3f64c6',
        evolutionUrl: 'http://localhost:8080',
        evolutionApiKey: 'teste-key',
        appWebhookUrl: 'http://localhost:3000',
        webhookSecret: 'secret-123'
      });

      assert.equal(res.ok, true);
      assert.ok(res.nomeInstancia.startsWith('medico_'));
      assert.equal(executedQueries.length, 1);
      assert.ok(executedQueries[0].sql.includes('whatsapp_instancias'));

      const criacao = chamadas.find((c) => c.url.includes('/instance/create'));
      assert.equal(criacao?.body.syncFullHistory, true);

      const configuracao = chamadas.find((c) => c.url.includes('/settings/set/'));
      assert.equal(configuracao?.body.syncFullHistory, true);
      assert.equal(configuracao?.body.rejectCall, true);
      assert.equal(configuracao?.body.msgCall, 'Não posso atender agora.');
      assert.equal(configuracao?.body.groupsIgnore, false);

      const webhook = chamadas.find((c) => c.url.includes('/webhook/set/'));
      assert.ok(webhook?.body.webhook.events.includes('MESSAGES_SET'));
      assert.ok(webhook?.body.webhook.events.includes('CHATS_SET'));
      assert.ok(webhook?.body.webhook.events.includes('CONTACTS_SET'));
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });
});
