/**
 * Verifica o contrato HTTP do OTP interativo e o fallback em texto sem
 * depender de uma instância real da Evolution API.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { EvolutionApiClient } from './evolution-api-client.js';

describe('EvolutionApiClient OTP', () => {
  it('deve enviar o botão de copiar sem duplicar o OTP em texto', async () => {
    const fetchOriginal = globalThis.fetch;
    const chamadas: Array<{ url: string; body: any }> = [];
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ key: { id: 'MSG-1' } }), { status: 201 });
    };

    try {
      const client = new EvolutionApiClient('https://evolution.exemplo.com', 'api-key', 'notomed_oficial');
      const resultado = await client.enviar({ telefone: '51999998888', codigo: '123456' });

      assert.equal(resultado.sucesso, true);
      assert.equal(chamadas.length, 1);
      assert.ok(chamadas[0].url.endsWith('/message/sendButtons/notomed_oficial'));
      assert.equal(chamadas[0].body.number, '5551999998888');
      assert.equal(chamadas[0].body.description, 'Seu código de verificação é *123456*.');
      assert.equal(chamadas[0].body.title, undefined);
      assert.equal(chamadas[0].body.footer, undefined);
      assert.deepEqual(chamadas[0].body.buttons, [{
        type: 'copy',
        displayText: 'Copiar código',
        copyCode: '123456'
      }]);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it('deve usar mensagem de texto quando o botão for rejeitado', async () => {
    const fetchOriginal = globalThis.fetch;
    const chamadas: Array<{ url: string; body: any }> = [];
    globalThis.fetch = async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      if (String(url).includes('/sendButtons/')) {
        return new Response('botões indisponíveis', { status: 400 });
      }
      return new Response(JSON.stringify({ key: { id: 'MSG-2' } }), { status: 201 });
    };

    try {
      const client = new EvolutionApiClient('https://evolution.exemplo.com', 'api-key', 'notomed_oficial');
      const resultado = await client.enviar({ telefone: '5551999998888', codigo: '654321' });

      assert.equal(resultado.sucesso, true);
      assert.equal(chamadas.length, 2);
      assert.ok(chamadas[1].url.endsWith('/message/sendText/notomed_oficial'));
      assert.equal(chamadas[1].body.text, 'Seu código de verificação é *654321*.');
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });
});
