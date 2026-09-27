import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MeuDanfeClient } from './meu-danfe-client.js';

describe('MeuDanfeClient', () => {
  it('deve retornar erro quando api-key estiver vazia', async () => {
    const client = new MeuDanfeClient('');
    const res = await client.converterXmlParaPdf('<xml></xml>');
    assert.equal(res.sucesso, false);
    assert.match(res.erro || '', /Api-Key/);
  });

  it('deve retornar erro quando XML estiver vazio', async () => {
    const client = new MeuDanfeClient('chave_teste');
    const res = await client.converterXmlParaPdf('   ');
    assert.equal(res.sucesso, false);
    assert.match(res.erro || '', /XML vazio/);
  });

  it('deve converter com sucesso quando API retornar Base64Response válido', async () => {
    const fakePdfBase64 = Buffer.from('%PDF-1.4 Fake PDF Content').toString('base64');
    
    // Mock global fetch
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (url: any, init: any) => {
        assert.match(String(url), /\/fd\/convert\/xml-to-da$/);
        assert.equal(init?.headers?.['Api-Key'], 'minha_chave_123');
        assert.equal(init?.headers?.['Content-Type'], 'application/json');
        
        const bodyObj = JSON.parse(init?.body as string);
        assert.equal(bodyObj.type, 'NFSE');
        assert.ok(bodyObj.data);

        return {
          ok: true,
          status: 200,
          json: async () => ({
            name: 'DANFSe-123.pdf',
            type: 'NFSE',
            format: 'pdf',
            data: fakePdfBase64
          })
        } as any;
      };

      const client = new MeuDanfeClient('minha_chave_123');
      const res = await client.converterXmlParaPdf('<NFSe><infNFSe></infNFSe></NFSe>');

      assert.equal(res.sucesso, true);
      assert.equal(res.pdfBase64, fakePdfBase64);
      assert.ok(res.pdfBytes instanceof Buffer);
      assert.equal(res.nomeArquivo, 'DANFSe-123.pdf');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('deve lidar com erro HTTP retornado pelo servidor Meu Danfe', async () => {
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({
        ok: false,
        status: 401,
        text: async () => '{"error":"Unauthorized"}'
      } as any);

      const client = new MeuDanfeClient('chave_invalida');
      const res = await client.converterXmlParaPdf('<NFSe></NFSe>');

      assert.equal(res.sucesso, false);
      assert.match(res.erro || '', /HTTP 401/);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
