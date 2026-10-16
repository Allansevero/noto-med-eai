import test from 'node:test';
import assert from 'node:assert';
import { detectarPrePedidoNota } from './detectar-pedido-nota.js';

test('detectarPrePedidoNota: identifica mensagens com gatilho de nota', () => {
  const r1 = detectarPrePedidoNota('emite a nota do Antônio Marques');
  assert.strictEqual(r1.ehCandidatoPedido, true);

  const r2 = detectarPrePedidoNota('gera a nf de ontem');
  assert.strictEqual(r2.ehCandidatoPedido, true);

  const r3 = detectarPrePedidoNota('olá tudo bem?');
  assert.strictEqual(r3.ehCandidatoPedido, false);
});

test('detectarPrePedidoNota: extrai CPF válido mesmo sem palavras-chave explícitas', () => {
  // CPF de teste válido conhecido: 52998224725
  const res = detectarPrePedidoNota('solicitação 529.982.247-25 consulta');
  assert.strictEqual(res.ehCandidatoPedido, true);
  assert.strictEqual(res.cpfLimpo, '52998224725');
});

test('detectarPrePedidoNota: ignora CPF com dígitos verificadores inválidos', () => {
  const res = detectarPrePedidoNota('nota para 111.111.111-11');
  assert.strictEqual(res.ehCandidatoPedido, true);
  assert.strictEqual(res.cpfLimpo, null);
});

test('detectarPrePedidoNota: extrai telefone e valores em reais', () => {
  const res = detectarPrePedidoNota('nota pro 51 99812-4521 valor de R$ 450,00 consulta de ontem');
  assert.strictEqual(res.ehCandidatoPedido, true);
  assert.strictEqual(res.telefone, '51998124521');
  assert.strictEqual(res.valorCentavos, 45000);
});
