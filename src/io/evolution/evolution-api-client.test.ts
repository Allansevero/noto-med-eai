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
      assert.equal(chamadas[0].body.title, '');
      assert.equal(chamadas[0].body.footer, '');
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

it('envio de texto tem prazo limitado e falha sem confirmar entrega',async t=>{
 let sinal:AbortSignal|null|undefined;
 t.mock.method(globalThis,'fetch',async(_url:unknown,init?:RequestInit)=>{
  sinal=init?.signal;
  throw new Error('timeout sintético');
 });
 const client=new EvolutionApiClient('https://evolution.exemplo.com','chave','oficial');
 const resposta=await client.enviarTexto({instanciaNome:'assistente',contatoTelefone:'5511999998888',texto:'Teste'});
 assert.equal(resposta.sucesso,false);
 assert.ok(sinal,'envio precisa de AbortSignal');
});

it('instância reservada ao OTP bloqueia texto e PDF comuns antes do HTTP',async t=>{
 let requests=0;t.mock.method(globalThis,'fetch',async()=>{requests++;return Response.json({key:{id:'codigo'}});});
 const client=new EvolutionApiClient('https://e.test','chave','oficial','oficial');
 assert.equal((await client.enviarTexto({instanciaNome:'oficial',contatoTelefone:'5511999991234',texto:'conversa'})).sucesso,false);
 assert.equal((await client.enviarPdf({instanciaNome:'oficial',contatoTelefone:'5511999991234',pdfPathOuUrl:'https://e.test/test.pdf',nomeArquivo:'teste.pdf'})).sucesso,false);
 assert.equal(requests,0);assert.equal((await client.enviar({telefone:'5511999991234',codigo:'123456'})).sucesso,true);assert.equal(requests,1);
});
