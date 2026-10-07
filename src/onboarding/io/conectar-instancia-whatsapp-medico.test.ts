import { describe, it, test } from 'node:test';
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
        if (sql.includes('select u.telefone')) {
          return { rows: [{ telefone: '51999998888' }] };
        }
        return { rows: [{ id: 'inst-123' }] };
      }
    } as any;

    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : undefined
      });
      if (String(url).includes('/instance/create')) {
        return new Response(JSON.stringify({}), { status: 201 });
      }
      if (String(url).includes('/instance/connect/')) {
        return new Response(JSON.stringify({ pairingCode: 'ABCD-EFGH' }), { status: 200 });
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
      assert.equal(res.pairingCode, 'ABCD-EFGH');
      assert.equal(res.qrcodeBase64, null);
      assert.ok(res.nomeInstancia.startsWith('medico_'));
      assert.ok(executedQueries.some(({ sql }) => sql.includes('whatsapp_instancias')));

      const criacao = chamadas.find((c) => c.url.includes('/instance/create'));
      assert.equal(criacao?.body.syncFullHistory, true);
      assert.equal(criacao?.body.qrcode, false);
      assert.equal(criacao?.body.number, '5551999998888');

      const conexao = chamadas.find((c) => c.url.includes('/instance/connect/'));
      assert.ok(conexao?.url.includes('number=5551999998888'));

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


async function simularEvolution(
  respostaConectar: { status: number; data: unknown },
  modoConexao: 'codigo' | 'qrcode' = 'codigo',
  conectado = false
) {
  const original = globalThis.fetch;
  const chamadas: Array<{ url: string; body?: any }> = [];
  let consultasTelefone = 0;
  const pool = { query: async (sql: string) => {
    if (sql.includes('select u.telefone')) { consultasTelefone++; return { rows: [{ telefone: '48912345678' }] }; }
    return { rows: [{ id: 'instancia' }] };
  } } as any;
  globalThis.fetch = async (url, init) => {
    chamadas.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (String(url).includes('/instance/create')) return Response.json({ error: 'Instance already exists' }, { status: 409 });
    if (String(url).includes('/instance/connect/')) return Response.json(respostaConectar.data, { status: respostaConectar.status });
    if (String(url).includes('/instance/connectionState/')) return Response.json({ instance: { state: conectado ? 'open' : 'close' } });
    return Response.json({});
  };
  try {
    const resultado = await conectarInstanciaWhatsappMedico(pool, {
      medicoId: 'medico-teste', modoConexao,
      evolutionUrl: 'http://evolution.test', evolutionApiKey: 'chave-secreta',
      appWebhookUrl: 'http://noto.test', webhookSecret: 'segredo-webhook'
    } as any);
    return { resultado: resultado as any, chamadas, consultasTelefone };
  } finally { globalThis.fetch = original; }
}

test('QR explícito não consulta nem envia telefone e reutiliza a instância existente', async () => {
  const t = await simularEvolution({ status: 200, data: { base64: 'imagem-qr', pairingCode: 'codigo-antigo' } }, 'qrcode');
  assert.equal(t.consultasTelefone, 0);
  assert.equal(t.chamadas.find(c => c.url.includes('/instance/create'))?.body.number, undefined);
  assert.equal(t.chamadas.find(c => c.url.includes('/instance/create'))?.body.qrcode, true);
  assert.equal(t.chamadas.find(c => c.url.includes('/instance/connect/'))?.url, 'http://evolution.test/instance/connect/medico_medicoteste');
  assert.equal(t.resultado.ok, true);
  assert.equal(t.resultado.qrcodeBase64, 'data:image/png;base64,imagem-qr');
  assert.equal(t.resultado.pairingCode, null);
  assert.equal(t.chamadas.some(c => /logout|delete/.test(c.url)), false);
});

test('rejeição HTTP no pareamento deixa diagnóstico estruturado e não retorna sucesso', async () => {
  const t = await simularEvolution({ status: 400, data: { response: { message: ['Número incorreto', 'chave-secreta', '48912345678'] } } });
  assert.equal(t.resultado.ok, false);
  assert.equal(t.resultado.status, 'erro');
  assert.deepEqual(t.resultado.diagnostico, { etapa: 'instance/connect', codigo: 'HTTP_ERRO', statusHttp: 400 });
  assert.match(t.resultado.detalhe, /QR Code/);
  assert.equal(/chave-secreta|48912345678/.test(JSON.stringify(t.resultado)), false);
});

test('resposta vazia não é anunciada como conexão pronta', async () => {
  const t = await simularEvolution({ status: 200, data: {} });
  assert.equal(t.resultado.ok, false);
  assert.equal(t.resultado.diagnostico.codigo, 'CODIGO_NAO_GERADO');
});

test('instância já conectada é reconhecida mesmo sem um novo código', async () => {
  const t = await simularEvolution({ status: 200, data: {} }, 'qrcode', true);
  assert.equal(t.resultado.ok, true);
  assert.equal(t.resultado.status, 'open');
});
