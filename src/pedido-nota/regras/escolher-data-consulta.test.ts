import test from 'node:test';
import assert from 'node:assert';
import { escolherDataConsulta } from './escolher-data-consulta.js';

const DATA_FIXA = new Date(2026, 9, 15, 12, 0, 0); // 15 de Outubro de 2026

test('escolherDataConsulta: reconhece "ontem" relativo à data informada', () => {
  const d = escolherDataConsulta({
    textoData: 'ontem',
    dataReferencia: DATA_FIXA
  });
  assert.strictEqual(d, '14/10/2026');
});

test('escolherDataConsulta: reconhece data DD/MM/YYYY informada', () => {
  const d = escolherDataConsulta({
    textoData: '10/10/2026',
    dataReferencia: DATA_FIXA
  });
  assert.strictEqual(d, '10/10/2026');
});

test('escolherDataConsulta: reconhece data DD/MM abreviada', () => {
  const d = escolherDataConsulta({
    textoData: '05/09',
    dataReferencia: DATA_FIXA
  });
  assert.strictEqual(d, '05/09/2026');
});

test('escolherDataConsulta: rejeita data futura e cai para a data da fonte ou hoje', () => {
  const d = escolherDataConsulta({
    textoData: '25/12/2028',
    dataSugeridaFonte: '12/10/2026',
    dataReferencia: DATA_FIXA
  });
  assert.strictEqual(d, '12/10/2026');
});

test('escolherDataConsulta: cai para hoje caso nenhum dado seja informado', () => {
  const d = escolherDataConsulta({
    dataReferencia: DATA_FIXA
  });
  assert.strictEqual(d, '15/10/2026');
});
