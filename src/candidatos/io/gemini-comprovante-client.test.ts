import assert from 'node:assert/strict';
import test from 'node:test';
import { GeminiComprovanteClient } from './gemini-comprovante-client.js';

test('retorna ehComprovante false quando a chave não foi configurada', async () => {
  const cliente = new GeminiComprovanteClient('');
  const r = await cliente.analisarMidia({ base64: 'abc' });
  assert.equal(r.ehComprovante, false);
});

test('retorna ehComprovante false quando a mídia está vazia', async () => {
  const cliente = new GeminiComprovanteClient('chave_teste');
  const r = await cliente.analisarMidia({ base64: '' });
  assert.equal(r.ehComprovante, false);
});

test('processa resposta de sucesso da API do Gemini convertendo reais para centavos', async () => {
  const mockFetch: typeof fetch = async (url, init) => {
    assert.ok(String(url).includes('generateContent'));
    const body = JSON.parse(String(init?.body));
    assert.equal(body.contents[0].parts[1].inlineData.mimeType, 'application/pdf');

    return {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    ehComprovante: true,
                    ehNotaFiscal: false,
                    tipo: 'pix',
                    valor: 450.50,
                    dataPagamento: '2026-10-14',
                    idTransacao: 'E1234567890',
                    pagadorNome: 'Mariana Souza',
                    favorecidoNome: 'Dr. Roberto'
                  })
                }
              ]
            }
          }
        ]
      })
    } as any;
  };

  const cliente = new GeminiComprovanteClient('chave_teste', 'gemini-2.5-flash', mockFetch);
  const r = await cliente.analisarMidia({
    base64: 'data:application/pdf;base64,JVBERi0xLjQK...',
    mimeType: 'application/pdf'
  });

  assert.equal(r.ehComprovante, true);
  assert.equal(r.ehNotaFiscal, false);
  assert.equal(r.tipo, 'pix');
  assert.equal(r.valorCentavos, 45050);
  assert.equal(r.valorFormatado, '450.50');
  assert.equal(r.dataPagamento, '2026-10-14');
  assert.equal(r.idTransacao, 'E1234567890');
  assert.equal(r.pagadorNome, 'Mariana Souza');
});

test('identifica documento como nota fiscal sem falhar', async () => {
  const mockFetch: typeof fetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  ehComprovante: false,
                  ehNotaFiscal: true,
                  valor: 450.00
                })
              }
            ]
          }
        }
      ]
    })
  } as any);

  const cliente = new GeminiComprovanteClient('chave_teste', 'gemini-2.5-flash', mockFetch);
  const r = await cliente.analisarMidia({ base64: 'base64_qualquer' });

  assert.equal(r.ehComprovante, false);
  assert.equal(r.ehNotaFiscal, true);
});

test('trata erro HTTP da API do Gemini sem lançar exceção', async () => {
  const mockFetch: typeof fetch = async () => ({
    ok: false,
    status: 403,
    text: async () => 'PERMISSION_DENIED'
  } as any);

  const cliente = new GeminiComprovanteClient('chave_teste', 'gemini-2.5-flash', mockFetch);
  const r = await cliente.analisarMidia({ base64: 'base64_qualquer' });

  assert.equal(r.ehComprovante, false);
});
