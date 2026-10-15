import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { registrarSinaisDeProcesso } from './registrar-sinais-de-processo.js';

function prepararCenario() {
  const processo = new EventEmitter();
  const chamadas: Array<[string, number]> = [];
  registrarSinaisDeProcesso(processo, async (motivo, codigo) => { chamadas.push([motivo, codigo]); });
  return { processo, chamadas };
}

test('SIGTERM e SIGINT encerram com código 0', () => {
  const { processo, chamadas } = prepararCenario();
  processo.emit('SIGTERM');
  processo.emit('SIGINT');
  assert.deepEqual(chamadas, [['SIGTERM', 0], ['SIGINT', 0]]);
});

test('exceção não capturada encerra com código 1', () => {
  const { processo, chamadas } = prepararCenario();
  const original = console.error;
  console.error = () => {};
  try { processo.emit('uncaughtException', new Error('falha de teste')); } finally { console.error = original; }
  assert.deepEqual(chamadas, [['uncaughtException', 1]]);
});

test('promessa rejeitada só registra log e não encerra o processo', () => {
  const { processo, chamadas } = prepararCenario();
  const original = console.error;
  console.error = () => {};
  try { processo.emit('unhandledRejection', new Error('rejeitada')); } finally { console.error = original; }
  assert.deepEqual(chamadas, []);
});
