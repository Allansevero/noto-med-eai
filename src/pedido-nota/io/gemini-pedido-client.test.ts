import test from 'node:test';
import assert from 'node:assert';
import { GeminiPedidoClient } from './gemini-pedido-client.js';

test('GeminiPedidoClient: retorna ehPedidoNota falso quando sem chave ou resposta vazia', async () => {
  const clientSemChave = new GeminiPedidoClient('');
  const res = await clientSemChave.extrairIntencaoPedido('emite nota');
  assert.strictEqual(res.ehPedidoNota, false);
});

test('GeminiPedidoClient: parseia resposta estruturada do Gemini', async () => {
  const mockFetch = async () => ({
    ok: true,
    json: async () => ({
      candidates: [
        {
          content: {
            parts: [
              {
                text: JSON.stringify({
                  ehPedidoNota: true,
                  nomePaciente: 'Antônio Marques',
                  dataConsultaTexto: 'ontem',
                  valor: 400.0,
                  confianca: 0.95
                })
              }
            ]
          }
        }
      ]
    })
  }) as any;

  const client = new GeminiPedidoClient('test-key', 'gemini-2.5-flash', mockFetch);
  const res = await client.extrairIntencaoPedido('gera a nota do Antônio Marques de ontem 400 reais');

  assert.strictEqual(res.ehPedidoNota, true);
  assert.strictEqual(res.nomePaciente, 'Antônio Marques');
  assert.strictEqual(res.dataConsultaTexto, 'ontem');
  assert.strictEqual(res.valorCentavos, 40000);
});
