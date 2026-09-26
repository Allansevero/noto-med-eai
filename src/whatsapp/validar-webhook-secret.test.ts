import { describe, it } from 'node:test';
import assert from 'node:assert';
import { validarWebhookSecret } from './validar-webhook-secret.js';

describe('validarWebhookSecret', () => {
  const segredoCorreto = 'evolution-webhook-secret-xyz';

  it('deve rejeitar quando token recebido for nulo, indefinido ou vazio', () => {
    assert.strictEqual(validarWebhookSecret(null, segredoCorreto), false);
    assert.strictEqual(validarWebhookSecret(undefined, segredoCorreto), false);
    assert.strictEqual(validarWebhookSecret('', segredoCorreto), false);
  });

  it('deve rejeitar quando segredo configurado for vazio', () => {
    assert.strictEqual(validarWebhookSecret(segredoCorreto, ''), false);
  });

  it('deve rejeitar token com tamanho diferente', () => {
    assert.strictEqual(validarWebhookSecret('token-curto', segredoCorreto), false);
  });

  it('deve rejeitar token de mesmo tamanho mas conteúdo diferente', () => {
    const tokenIncorreto = 'evolution-webhook-secret-abc';
    assert.strictEqual(validarWebhookSecret(tokenIncorreto, segredoCorreto), false);
  });

  it('deve aceitar token idêntico ao configurado', () => {
    assert.strictEqual(validarWebhookSecret(segredoCorreto, segredoCorreto), true);
  });
});
