import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { tentarAnalisarComprovanteMensagem } from './analisar-comprovante-mensagem.js';

describe('tentarAnalisarComprovanteMensagem', () => {
  test('deve ignorar mensagem enviada pela própria clínica (fromMe = true)', async () => {
    let chamouVlm = false;
    const res = await tentarAnalisarComprovanteMensagem(
      'inst-1',
      'msg-1',
      'imagem',
      true,
      { base64: 'abc' },
      {
        comprovanteClient: {
          analisarImagem: async () => {
            chamouVlm = true;
            return { ehComprovante: true };
          }
        } as any
      }
    );

    assert.equal(res, null);
    assert.equal(chamouVlm, false);
  });

  test('deve ignorar mensagem de texto', async () => {
    let chamouVlm = false;
    const res = await tentarAnalisarComprovanteMensagem(
      'inst-1',
      'msg-1',
      'texto',
      false,
      {},
      {
        comprovanteClient: {
          analisarImagem: async () => {
            chamouVlm = true;
            return { ehComprovante: true };
          }
        } as any
      }
    );

    assert.equal(res, null);
    assert.equal(chamouVlm, false);
  });

  test('deve obter base64 via evolutionClient se não vier embutida no payload', async () => {
    let buscouMidia = false;
    const res = await tentarAnalisarComprovanteMensagem(
      'inst-1',
      'msg-midia-1',
      'imagem',
      false,
      {},
      {
        evolutionClient: {
          obterBase64MensagemMidia: async (inst: string, id: string) => {
            buscouMidia = true;
            assert.equal(inst, 'inst-1');
            assert.equal(id, 'msg-midia-1');
            return { base64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZxoAAAAASUVORK5CYII=' };
          }
        } as any,
        comprovanteClient: {
          analisarImagem: async (b64: string) => {
            assert.equal(b64, 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/ZxoAAAAASUVORK5CYII=');
            return { ehComprovante: true, valorCentavos: 40000 };
          }
        } as any
      }
    );

    assert.equal(buscouMidia, true);
    assert.equal(res?.ehComprovante, true);
    assert.equal(res?.valorCentavos, 40000);
    assert.match(res?.documentoHash || '', /^[a-f0-9]{64}$/);
  });

  test('deve retornar null se VLM falhar sem lançar exceção não tratada', async () => {
    const res = await tentarAnalisarComprovanteMensagem(
      'inst-1',
      'msg-1',
      'imagem',
      false,
      { base64: 'b64-err' },
      {
        comprovanteClient: {
          analisarImagem: async () => {
            throw new Error('Timeout PaliGemma');
          }
        } as any
      }
    );

    assert.equal(res, null);
  });
});
