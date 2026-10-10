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

it('marca leitura com a chave original do webhook e timeout isolado', async t => {
  let chamada: any;
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    chamada = { url: String(url), body: JSON.parse(String(init?.body)), signal: init?.signal };
    return new Response('{}', { status: 201 });
  });
  const c = new EvolutionApiClient('https://evolution.exemplo.com', 'chave', 'oficial', 'oficial');
  const resultado = await (c as any).marcarLida({ instanciaNome: 'assistente', mensagemId: 'msg-1', contatoTelefone: '5551999999999',
    chaveMensagem: { id: 'msg-1', remoteJid: '123456@lid', remoteJidAlt: '5551999999999@s.whatsapp.net', fromMe: false } });
  assert.equal(resultado.sucesso, true);
  assert.equal(chamada.url, 'https://evolution.exemplo.com/chat/markMessageAsRead/assistente');
  assert.deepEqual(chamada.body, { readMessages: [{ id: 'msg-1', remoteJid: '123456@lid', fromMe: false }] });
  assert.ok(chamada.signal);
});
it('leitura protege canal oficial, grupos e mensagens próprias e informa HTTP sem corpo', async t => {
  let chamadas = 0;
  t.mock.method(globalThis, 'fetch', async () => { chamadas++; return new Response('segredo', { status: 500 }); });
  const c = new EvolutionApiClient('https://evolution.exemplo.com', 'chave', 'oficial', 'oficial');
  const entrada = { instanciaNome: 'assistente', mensagemId: 'msg', contatoTelefone: '5551999999999', chaveMensagem: { id: 'msg', remoteJid: '5551999999999@s.whatsapp.net', fromMe: false } };
  assert.equal((await (c as any).marcarLida({ ...entrada, instanciaNome: 'oficial' })).sucesso, false);
  assert.equal((await (c as any).marcarLida({ ...entrada, chaveMensagem: { ...entrada.chaveMensagem, fromMe: true } })).sucesso, false);
  assert.equal((await (c as any).marcarLida({ ...entrada, chaveMensagem: { ...entrada.chaveMensagem, remoteJid: '123@g.us' } })).sucesso, false);
  assert.equal(chamadas, 0);
  const falha = await (c as any).marcarLida(entrada);
  assert.equal(falha.sucesso, false); assert.equal(falha.erro, 'EVOLUTION_HTTP_500');
});
