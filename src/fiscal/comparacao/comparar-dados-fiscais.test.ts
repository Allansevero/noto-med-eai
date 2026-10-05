/** Coincidência dos parâmetros não equivale a validação tributária independente. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compararDadosFiscais } from './comparar-dados-fiscais.js';
import type { ContextoComparacao, EvidenciasExternas } from './tipos.js';

const base: ContextoComparacao = { referenciaHash: 'hash', numero: '42', competencia: '2026-10-01', ambiente: 'producao',
  politicaConfirmada: false, pendencias: [], referencia: { razaoSocial: 'Clínica', opcaoSimplesNacional: 'me_epp', 'ibscbs.CST': '000' },
  preparado: { razaoSocial: 'Clínica', opcaoSimplesNacional: 'me_epp', 'ibscbs.CST': '000' } };
const externo: EvidenciasExternas = { cadastral: { fonte: 'Cadastro', estado: 'consultada', mensagem: '', dados: { razaoSocial: 'CLINICA', opcaoSimplesNacional: 'me_epp' } },
  convenio: { fonte: 'ADN', estado: 'consultada', mensagem: '', dados: {} },
  aliquota: { fonte: 'ADN', estado: 'consultada', mensagem: '', dados: { aliquotaMunicipal: 5 } } };
test('mostra igualdade parcial e preserva IBS/CBS como não conferido independentemente', () => {
  const r = compararDadosFiscais(base, externo, '2026-10-05T12:00:00Z');
  assert.equal(r.estado, 'comparacao_parcial'); assert.equal(r.divergencias, 0);
  const ibs = r.linhas.find(l => l.campo === 'ibscbs.CST')!;
  assert.equal(ibs.preparado, '000'); assert.equal(ibs.estado, 'nao_conferido');
  assert.equal(ibs.comparacaoNoto, 'coincide');
  assert.equal(r.linhas.find(l => l.campo === 'aliquotaIss')!.consultado, null);
});
test('diferença no cadastro e remoção de campo da referência são reportadas sem alterar parâmetros', () => {
  const contexto = structuredClone(base); contexto.preparado['ibscbs.CST'] = null;
  const evidencias = structuredClone(externo); evidencias.cadastral.dados.opcaoSimplesNacional = 'nao_optante';
  const antes = JSON.stringify({ contexto, evidencias });
  const r = compararDadosFiscais(contexto, evidencias, '2026-10-05T12:00:00Z');
  assert.equal(r.estado, 'divergencias'); assert.equal(r.divergencias, 2);
  assert.equal(JSON.stringify({ contexto, evidencias }), antes);
});
test('API indisponível e referência ausente nunca são apresentadas como coincidência completa', () => {
  const evidencias = structuredClone(externo); evidencias.cadastral.estado = 'indisponivel';
  const r = compararDadosFiscais(base, evidencias, '2026-10-05');
  assert.equal(r.linhas.find(l => l.campo === 'opcaoSimplesNacional')!.estado, 'nao_conferido');
  const sem = compararDadosFiscais({ ...base, referenciaHash: null, referencia: {}, preparado: {} }, externo, '2026-10-05');
  assert.equal(sem.estado, 'sem_referencia');
  assert.ok(sem.linhas.every(l => l.comparacaoNoto === 'sem_referencia'));
});
