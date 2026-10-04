/** Evidência incompleta ou resultado ambíguo não autoriza edição da DPS. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCO_FEDERAL_AUTOMATICO, podeCorrigirTributosFederais } from './analisar-rejeicao.js';
import type { FalhaEmissao } from './investigacao.js';
export const rejeicao: FalhaEmissao = {
  sucesso: false, erro: 'Tributos federais não permitidos', codigoErroSefin: 'E0676', httpStatus: 422,
  respostaSefinRaw: { erros: [{ Codigo: 'E0676' }] },
  xmlDpsOriginal: `<DPS>${BLOCO_FEDERAL_AUTOMATICO}</DPS>`,
  contextoTecnico: { dataGeracao: '2026-10-04T12:00:00.000Z', ndps: 10 }
};
test('rejeição explícita autoriza somente bloco automático conhecido', () => {
  assert.equal(podeCorrigirTributosFederais(rejeicao), true);
  for (const parcial of [
    { httpStatus: 500 }, { codigoErroSefin: 'E0014' }, { xmlDpsOriginal: undefined },
    { xmlDpsOriginal: '<DPS><tribFed><piscofins><CST>01</CST><vPis>100</vPis></piscofins></tribFed></DPS>' },
    { respostaSefinRaw: { erros: [{ Codigo: 'E0676' }, { Codigo: 'E0014' }] } },
    { contextoTecnico: {} }
  ]) assert.equal(podeCorrigirTributosFederais({ ...rejeicao, ...parcial }), false);
});

test('descrições fornecem contexto sem repassar payload completo ou complemento', async () => {
  const { descreverRetornoProvedor } = await import('./analisar-rejeicao.js');
  const dados = descreverRetornoProvedor({ ...rejeicao, respostaSefinRaw: {
    erros: [{ Codigo: 'E0676', Descricao: 'Documento 123.456.789-00 e contato nome@dominio.com: valor "privado".', Complemento: 'segredo' }],
    xml: '<certificado>segredo</certificado>'
  } });
  const texto = JSON.stringify(dados);
  assert.ok(texto.includes('E0676'));
  for (const privado of ['123.456.789-00', 'nome@dominio.com', 'segredo', 'privado']) assert.ok(!texto.includes(privado));
});
