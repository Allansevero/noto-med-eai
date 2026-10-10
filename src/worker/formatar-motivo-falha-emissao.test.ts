/**
 * Testes da formatação detalhada de pendências fiscais e falhas de emissão.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatarMotivoFalhaEmissao } from './formatar-motivo-falha-emissao.js';
import type { FalhaEmissao } from '../agente-fiscal/investigacao.js';

test('formata pendências fiscais estruturadas incluindo campo, código e mensagem', () => {
  const falha: FalhaEmissao = {
    sucesso: false,
    erro: 'Há parâmetros fiscais pendentes de revisão antes do envio.',
    pendenciasFiscais: [
      { campo: 'vigencia', codigo: 'FORA_DA_VIGENCIA', mensagem: 'Revisar os parâmetros aplicáveis à competência da nota.' }
    ]
  };
  const resultado = formatarMotivoFalhaEmissao(falha);
  assert.equal(
    resultado,
    'Há parâmetros fiscais pendentes de revisão antes do envio. Detalhes: vigencia (FORA_DA_VIGENCIA): Revisar os parâmetros aplicáveis à competência da nota.'
  );
});

test('formata rejeição SEFIN com código do erro', () => {
  const falha: FalhaEmissao = {
    sucesso: false,
    erro: 'DPS com data de competência inválida.',
    codigoErroSefin: 'E0025'
  };
  const resultado = formatarMotivoFalhaEmissao(falha);
  assert.equal(resultado, 'Rejeição SEFIN E0025: DPS com data de competência inválida.');
});

test('retorna mensagem original quando não há pendências estruturadas nem código SEFIN', () => {
  const falha: FalhaEmissao = {
    sucesso: false,
    erro: 'Falha de conexão com o provedor.'
  };
  const resultado = formatarMotivoFalhaEmissao(falha);
  assert.equal(resultado, 'Falha de conexão com o provedor.');
});
