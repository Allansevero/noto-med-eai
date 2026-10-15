import assert from 'node:assert/strict';
import test from 'node:test';
import { validarComprovante } from './validar-comprovante.js';

test('rejeita quando não é comprovante bancário', () => {
  const r = validarComprovante({ ehComprovante: false });
  assert.equal(r.valido, false);
  assert.equal(r.motivo, 'nao_eh_comprovante');
});

test('rejeita quando é identificado como nota fiscal já existente', () => {
  const r = validarComprovante({ ehComprovante: true, ehNotaFiscal: true, valorCentavos: 35000 });
  assert.equal(r.valido, false);
  assert.equal(r.motivo, 'eh_nota_fiscal');
});

test('rejeita valor zero, negativo ou ausente', () => {
  assert.equal(validarComprovante({ ehComprovante: true, valorCentavos: 0 }).motivo, 'valor_invalido');
  assert.equal(validarComprovante({ ehComprovante: true, valorCentavos: -100 }).motivo, 'valor_invalido');
  assert.equal(validarComprovante({ ehComprovante: true }).motivo, 'valor_invalido');
});

test('rejeita valor acima do teto de segurança', () => {
  const r = validarComprovante({ ehComprovante: true, valorCentavos: 6_000_000 });
  assert.equal(r.valido, false);
  assert.equal(r.motivo, 'valor_invalido');
});

test('rejeita data futura além da margem de fuso', () => {
  const ref = new Date('2026-10-14T12:00:00Z');
  const r = validarComprovante(
    { ehComprovante: true, valorCentavos: 35000, dataPagamento: '2026-10-25' },
    ref
  );
  assert.equal(r.valido, false);
  assert.equal(r.motivo, 'data_futura');
});

test('aprova comprovante legítimo com valor e data válidos', () => {
  const ref = new Date('2026-10-14T12:00:00Z');
  const r = validarComprovante(
    {
      ehComprovante: true,
      tipo: 'pix',
      valorCentavos: 35000,
      dataPagamento: '2026-10-14',
      idTransacao: 'E123456789'
    },
    ref
  );
  assert.equal(r.valido, true);
  assert.equal(r.motivo, undefined);
});
