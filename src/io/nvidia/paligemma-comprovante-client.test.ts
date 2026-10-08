/**
 * Testes unitários para o cliente NVIDIA PaliGemma e o parser de comprovantes.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PaligemmaComprovanteClient,
  parsearRespostaComprovante
} from './paligemma-comprovante-client.js';

test('parsearRespostaComprovante extrai corretamente dados de comprovante PIX', () => {
  const jsonResposta = JSON.stringify({
    ehComprovante: true,
    valor: 350.50,
    data: '2026-10-05',
    pagador: 'Carlos Eduardo',
    favorecido: 'Dr. Roberto Médico',
    idTransacao: 'E1234567890123456789',
    tipo: 'pix'
  });

  const res = parsearRespostaComprovante(jsonResposta);
  assert.equal(res.ehComprovante, true);
  assert.equal(res.valorCentavos, 35050);
  assert.equal(res.valorFormatado, '350.50');
  assert.equal(res.dataPagamento, '2026-10-05');
  assert.equal(res.pagadorNome, 'Carlos Eduardo');
  assert.equal(res.favorecidoNome, 'Dr. Roberto Médico');
  assert.equal(res.transacaoId, 'E1234567890123456789');
  assert.equal(res.tipo, 'pix');
});

test('parsearRespostaComprovante identifica quando imagem não é comprovante', () => {
  assert.equal(parsearRespostaComprovante('{"ehComprovante": false}').ehComprovante, false);
  assert.equal(parsearRespostaComprovante('A imagem é uma foto de um cachorro, não um comprovante.').ehComprovante, false);
  assert.equal(parsearRespostaComprovante('').ehComprovante, false);
});

test('parsearRespostaComprovante limpa blocos markdown ```json corretamente', () => {
  const respostaMarkdown = `Aqui está o resultado:
\`\`\`json
{
  "ehComprovante": true,
  "valor": 1200.00,
  "data": "2026-09-30",
  "pagador": "Mariana Lima",
  "tipo": "ted"
}
\`\`\`
Obrigado!`;

  const res = parsearRespostaComprovante(respostaMarkdown);
  assert.equal(res.ehComprovante, true);
  assert.equal(res.valorCentavos, 120000);
  assert.equal(res.tipo, 'ted');
  assert.equal(res.pagadorNome, 'Mariana Lima');
});

test('PaligemmaComprovanteClient formata payload correto e consome API', async () => {
  let urlChamada = '';
  let corpoEnviado: any = null;
  let headersEnviados: any = null;

  const mockFetch: typeof fetch = async (url, init) => {
    urlChamada = String(url);
    headersEnviados = init?.headers;
    corpoEnviado = JSON.parse(String(init?.body));

    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ehComprovante: true,
                valor: 500,
                data: '2026-10-08',
                pagador: 'João Silva',
                tipo: 'pix'
              })
            }
          }
        ]
      })
    } as any;
  };

  const cliente = new PaligemmaComprovanteClient('token-teste', 'https://mock.nvidia/vlm', mockFetch);
  const resultado = await cliente.analisarImagem('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==');

  assert.equal(urlChamada, 'https://mock.nvidia/vlm');
  assert.match(headersEnviados.Authorization, /Bearer token-teste/);
  assert.equal(corpoEnviado.messages[0].content[1].type, 'image_url');
  assert.match(corpoEnviado.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);

  assert.equal(resultado.ehComprovante, true);
  assert.equal(resultado.valorCentavos, 50000);
  assert.equal(resultado.pagadorNome, 'João Silva');
});

test('PaligemmaComprovanteClient rejeita imagens que excedem tamanho máximo', async () => {
  const cliente = new PaligemmaComprovanteClient('token', 'https://mock.nvidia');
  const imagemGigante = 'A'.repeat(260_000);

  await assert.rejects(
    () => cliente.analisarImagem(imagemGigante),
    /muito grande para análise direta/
  );
});
