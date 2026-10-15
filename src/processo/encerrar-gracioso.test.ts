import assert from 'node:assert/strict';
import test from 'node:test';
import { criarEncerramentoGracioso, type AlvosEncerramento } from './encerrar-gracioso.js';

function criarAlvos(ordem: string[], pararWorker?: () => Promise<void>): AlvosEncerramento {
  return {
    fecharServidor: async () => { ordem.push('servidor'); },
    pararWorker: pararWorker ?? (async () => { ordem.push('worker'); }),
    fecharPool: async () => { ordem.push('pool'); }
  };
}

test('fecha o pool só depois de servidor e worker terminarem e sai com o código pedido', async () => {
  const ordem: string[] = [];
  const codigos: number[] = [];
  const encerrar = criarEncerramentoGracioso(criarAlvos(ordem), { tempoLimiteMs: 1000, sair: (c) => codigos.push(c) });

  await encerrar('SIGTERM', 0);

  assert.equal(ordem[ordem.length - 1], 'pool');
  assert.deepEqual([...ordem].sort(), ['pool', 'servidor', 'worker']);
  assert.deepEqual(codigos, [0]);
});

test('segundo pedido de encerramento é ignorado', async () => {
  const ordem: string[] = [];
  const codigos: number[] = [];
  const encerrar = criarEncerramentoGracioso(criarAlvos(ordem), { tempoLimiteMs: 1000, sair: (c) => codigos.push(c) });

  await encerrar('SIGTERM', 0);
  await encerrar('SIGINT', 0);

  assert.equal(ordem.filter((x) => x === 'pool').length, 1);
  assert.deepEqual(codigos, [0]);
});

test('worker travado não impede a saída: o limite de tempo encerra mesmo assim', async () => {
  const ordem: string[] = [];
  const codigos: number[] = [];
  const travado = () => new Promise<void>(() => {});
  const encerrar = criarEncerramentoGracioso(criarAlvos(ordem, travado), { tempoLimiteMs: 30, sair: (c) => codigos.push(c) });

  await encerrar('SIGTERM', 0);

  assert.deepEqual(codigos, [0]);
});

test('falha ao fechar o pool não impede a saída', async () => {
  const codigos: number[] = [];
  const alvos = { ...criarAlvos([]), fecharPool: async () => { throw new Error('pool já fechado'); } };
  const encerrar = criarEncerramentoGracioso(alvos, { tempoLimiteMs: 1000, sair: (c) => codigos.push(c) });

  await encerrar('uncaughtException', 1);

  assert.deepEqual(codigos, [1]);
});
