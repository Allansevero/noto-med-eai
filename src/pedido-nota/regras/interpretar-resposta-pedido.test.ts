import test from 'node:test';
import assert from 'node:assert';
import { interpretarRespostaPedido } from './interpretar-resposta-pedido.js';

test('interpretarRespostaPedido: reconhece afirmação simples', () => {
  const r1 = interpretarRespostaPedido('Sim');
  assert.strictEqual(r1.acao, 'confirmar');

  const r2 = interpretarRespostaPedido('pode emitir');
  assert.strictEqual(r2.acao, 'confirmar');
});

test('interpretarRespostaPedido: reconhece confirmação com ajuste de valor isolado', () => {
  const r1 = interpretarRespostaPedido('400');
  assert.strictEqual(r1.acao, 'confirmar');
  if (r1.acao === 'confirmar') {
    assert.strictEqual(r1.valorAjustadoCentavos, 40000);
  }

  const r2 = interpretarRespostaPedido('R$ 450,00');
  assert.strictEqual(r2.acao, 'confirmar');
  if (r2.acao === 'confirmar') {
    assert.strictEqual(r2.valorAjustadoCentavos, 45000);
  }
});

test('interpretarRespostaPedido: reconhece cancelamento', () => {
  const r = interpretarRespostaPedido('não');
  assert.strictEqual(r.acao, 'cancelar');

  const r2 = interpretarRespostaPedido('cancela');
  assert.strictEqual(r2.acao, 'cancelar');
});

test('interpretarRespostaPedido: reconhece seleção de opção numérica', () => {
  const r1 = interpretarRespostaPedido('1');
  assert.strictEqual(r1.acao, 'escolher_opcao');
  if (r1.acao === 'escolher_opcao') {
    assert.strictEqual(r1.indice, 0);
  }

  const r2 = interpretarRespostaPedido('opção 2');
  assert.strictEqual(r2.acao, 'escolher_opcao');
  if (r2.acao === 'escolher_opcao') {
    assert.strictEqual(r2.indice, 1);
  }
});

test('interpretarRespostaPedido: reconhece fornecimento de dados faltantes', () => {
  // CPF válido conhecido: 52998224725
  const r = interpretarRespostaPedido('o cpf é 529.982.247-25 valor 350');
  assert.strictEqual(r.acao, 'fornecer_dados');
  if (r.acao === 'fornecer_dados') {
    assert.strictEqual(r.cpf, '52998224725');
    assert.strictEqual(r.valorCentavos, 35000);
  }
});
