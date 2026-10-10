/**
 * Testes das regras de enquadramento de serviços médicos na Reforma Tributária:
 * 1. Identificação de serviços de medicina/saúde humana (cTribNac 0401xx e NBS 12205);
 * 2. Sugestão e enquadramento do benefício constitucional de 60% (CST 200, cClassTrib 200001);
 * 3. Garantia de indFinal=1 para paciente pessoa física (CPF);
 * 4. Serialização do grupo IBSCBS oficial na DPS da consulta.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ehServicoSaude,
  sugerirIbscbsSaude,
  ajustarIndFinalTomador
} from './classificar-servico-saude-reforma.js';
import { gerarXmlDps } from '../../io/fiscal/gerar-xml-dps.js';
import { parametrosEmissaoSchema } from './parametros-emissao.js';
import type { ConfigPrestador, EmissaoInput } from '../../io/fiscal/montar-dps.js';

test('identifica corretamente serviços de saúde por cTribNac e cNBS', () => {
  assert.equal(ehServicoSaude('040101'), true);
  assert.equal(ehServicoSaude('040102'), true);
  assert.equal(ehServicoSaude('010101', '122051900'), true);
  assert.equal(ehServicoSaude('010101', '101010000'), false);
  assert.equal(ehServicoSaude('070201'), false);
});

test('sugere benefício constitucional de redução de 60% (CST 200, cClassTrib 200001) para consultas médicas', () => {
  const sugestaoPf = sugerirIbscbsSaude({
    ctribNac: '040101',
    cnbs: '122051900',
    tomadorCpf: true,
    beneficioReducaoSaude: true
  });

  assert.deepEqual(sugestaoPf, {
    finNFSe: '0',
    indFinal: '1',
    cIndOp: '100301',
    indDest: '0',
    CST: '200',
    cClassTrib: '200001'
  });

  const sugestaoPj = sugerirIbscbsSaude({
    ctribNac: '040101',
    cnbs: '122051900',
    tomadorCpf: false,
    beneficioReducaoSaude: true
  });

  assert.equal(sugestaoPj.indFinal, '0');
  assert.equal(sugestaoPj.CST, '200');
  assert.equal(sugestaoPj.cClassTrib, '200001');
});

test('sugere regime padrão quando redução de saúde não é aplicada ou para MEI', () => {
  const semReducao = sugerirIbscbsSaude({
    ctribNac: '040101',
    tomadorCpf: true,
    beneficioReducaoSaude: false
  });
  assert.equal(semReducao.CST, '000');
  assert.equal(semReducao.cClassTrib, '000001');

  const mei = sugerirIbscbsSaude({
    ctribNac: '040101',
    opcaoSimplesNacional: 'mei'
  });
  assert.equal(mei.CST, '999');
  assert.equal(mei.cClassTrib, '000001');
});

test('garante indFinal=1 para consumidor final pessoa física', () => {
  const original = {
    finNFSe: '0' as const,
    indFinal: '0' as const,
    cIndOp: '100301',
    indDest: '0' as const,
    CST: '200',
    cClassTrib: '200001'
  };

  const ajustado = ajustarIndFinalTomador(original, true);
  assert.equal(ajustado.indFinal, '1');

  const inalterado = ajustarIndFinalTomador(original, false);
  assert.equal(inalterado.indFinal, '0');
});

test('DPS gera grupo IBSCBS com redução de 60% e consumidor final para paciente particular', () => {
  const hoje = '2026-10-08';
  const ibscbs = {
    finNFSe: '0' as const,
    indFinal: '0' as const, // original da política (ex: veio corporativo)
    cIndOp: '100301',
    indDest: '0' as const,
    CST: '200',
    cClassTrib: '200001'
  };

  const params = parametrosEmissaoSchema.parse({
    ambiente: 'homologacao',
    vigenciaInicio: hoje,
    municipioPrestacao: '3550308',
    opcaoSimplesNacional: 'nao_optante',
    regimeEspecialTributacao: 0,
    tribISSQN: 1,
    tpRetISSQN: 1,
    aliquotaIss: 2,
    cstPisCofins: '08',
    totalTributos: { tipo: 'nao_informado' },
    ibscbs
  });

  const prestador: ConfigPrestador = {
    cnpj: '11222333000181',
    im: '123456',
    codMunicipio: '3550308',
    ambiente: 2,
    serie: '1',
    regTrib: { opSimpNac: 1, regApTribSN: 1, regEspTrib: 0 },
    pTotTribSN: 0
  };

  const input: EmissaoInput = {
    nDPS: '200',
    tomador: { CPF: '52998224725', xNome: 'Paciente Particular' },
    xDescServ: 'Consulta Psiquiatria',
    vServ: 500,
    cTribNac: '040101',
    cNBS: '122051900',
    cIndOp: '100301',
    cClassTrib: '200001',
    fiscal: { ...params, competencia: hoje }
  };

  const { xml } = gerarXmlDps(input, prestador);

  assert.match(xml, /<IBSCBS><finNFSe>0<\/finNFSe><indFinal>1<\/indFinal><cIndOp>100301<\/cIndOp><indDest>0<\/indDest><valores><trib><gIBSCBS><CST>200<\/CST><cClassTrib>200001<\/cClassTrib><\/gIBSCBS><\/trib><\/valores><\/IBSCBS>/);
});
