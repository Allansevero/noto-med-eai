/**
 * Validação dos perfis tributários médicos do padrão nacional:
 * 1. Sociedade Uniprofissional (SUP, regEspTrib=6) com ISS fixo municipal;
 * 2. Simples Nacional com ISS apurado por fora no município (regApTribSN=2);
 * 3. Proteção legal de tpRetISSQN=1 quando o tomador da consulta é pessoa física (CPF);
 * 4. Emissão para tomador pessoa jurídica (CNPJ) com retenção na fonte.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gerarXmlDps } from '../../io/fiscal/gerar-xml-dps.js';
import { parametrosEmissaoSchema } from './parametros-emissao.js';
import type { ConfigPrestador, EmissaoInput } from '../../io/fiscal/montar-dps.js';

const hoje = '2026-10-08';

const prestadorSup: ConfigPrestador = {
  cnpj: '11222333000181',
  im: '123456',
  codMunicipio: '3550308',
  ambiente: 2,
  serie: '1',
  regTrib: {
    opSimpNac: 1,
    regApTribSN: 1,
    regEspTrib: 6
  },
  pTotTribSN: 0
};

test('Sociedade Uniprofissional (SUP regEspTrib=6) no Lucro Presumido emite sem alíquota de ISS', () => {
  const params = parametrosEmissaoSchema.parse({
    ambiente: 'homologacao',
    vigenciaInicio: hoje,
    municipioPrestacao: '3550308',
    opcaoSimplesNacional: 'nao_optante',
    regimeEspecialTributacao: 6,
    tribISSQN: 1,
    tpRetISSQN: 1,
    cstPisCofins: '08',
    totalTributos: { tipo: 'nao_informado' }
  });

  const input: EmissaoInput = {
    nDPS: '101',
    tomador: { CPF: '52998224725', xNome: 'Paciente Particular' },
    xDescServ: 'Consulta Médica Psiquiatria',
    vServ: 450,
    cTribNac: '040101',
    cNBS: '',
    cIndOp: '',
    cClassTrib: '',
    fiscal: { ...params, competencia: hoje }
  };

  const { xml } = gerarXmlDps(input, prestadorSup);

  assert.match(xml, /<regEspTrib>6<\/regEspTrib>/);
  assert.match(xml, /<opSimpNac>1<\/opSimpNac>/);
  assert.match(xml, /<tribISSQN>1<\/tribISSQN><tpRetISSQN>1<\/tpRetISSQN><\/tribMun>/);
  assert.doesNotMatch(xml, /<pAliq>/);
  assert.doesNotMatch(xml, /<regApTribSN>/);
});

test('Sociedade Uniprofissional no Simples Nacional com ISS municipal (regime_2) inclui regEspTrib=6 e regApTribSN=2', () => {
  const params = parametrosEmissaoSchema.parse({
    ambiente: 'homologacao',
    vigenciaInicio: hoje,
    municipioPrestacao: '3550308',
    opcaoSimplesNacional: 'me_epp',
    regimeApuracaoSn: 'regime_2',
    regimeEspecialTributacao: 6,
    tribISSQN: 1,
    tpRetISSQN: 1,
    cstPisCofins: '06',
    percentualTotTribSN: 5.5
  });

  const prestadorSimplesSup: ConfigPrestador = {
    ...prestadorSup,
    regTrib: {
      opSimpNac: 3,
      regApTribSN: 2,
      regEspTrib: 6
    }
  };

  const input: EmissaoInput = {
    nDPS: '102',
    tomador: { CPF: '52998224725', xNome: 'Paciente Particular' },
    xDescServ: 'Consulta Dermatologia',
    vServ: 500,
    cTribNac: '040101',
    cNBS: '',
    cIndOp: '',
    cClassTrib: '',
    fiscal: { ...params, competencia: hoje }
  };

  const { xml } = gerarXmlDps(input, prestadorSimplesSup);

  assert.match(xml, /<opSimpNac>3<\/opSimpNac><regApTribSN>2<\/regApTribSN><regEspTrib>6<\/regEspTrib>/);
  assert.match(xml, /<tribISSQN>1<\/tribISSQN><tpRetISSQN>1<\/tpRetISSQN><\/tribMun>/);
  assert.match(xml, /<pTotTribSN>5\.50<\/pTotTribSN>/);
});

test('Tomador pessoa física (CPF) nunca sofre retenção mesmo se a política do prestador permitir retenção', () => {
  const params = parametrosEmissaoSchema.parse({
    ambiente: 'homologacao',
    vigenciaInicio: hoje,
    municipioPrestacao: '3550308',
    opcaoSimplesNacional: 'nao_optante',
    regimeEspecialTributacao: 0,
    tribISSQN: 1,
    tpRetISSQN: 2,
    aliquotaIss: 3.5,
    cstPisCofins: '08',
    totalTributos: { tipo: 'nao_informado' }
  });

  const inputPf: EmissaoInput = {
    nDPS: '103',
    tomador: { CPF: '52998224725', xNome: 'Paciente PF' },
    xDescServ: 'Consulta Cardiologia',
    vServ: 600,
    cTribNac: '040101',
    cNBS: '',
    cIndOp: '',
    cClassTrib: '',
    fiscal: { ...params, competencia: hoje }
  };

  const { xml } = gerarXmlDps(inputPf, { ...prestadorSup, regTrib: { ...prestadorSup.regTrib, regEspTrib: 0 } });

  assert.match(xml, /<CPF>52998224725<\/CPF>/);
  assert.match(xml, /<tpRetISSQN>1<\/tpRetISSQN>/);
});

test('Tomador pessoa jurídica (CNPJ) emite com retenção tpRetISSQN=2 quando configurado', () => {
  const params = parametrosEmissaoSchema.parse({
    ambiente: 'homologacao',
    vigenciaInicio: hoje,
    municipioPrestacao: '3550308',
    opcaoSimplesNacional: 'nao_optante',
    regimeEspecialTributacao: 0,
    tribISSQN: 1,
    tpRetISSQN: 2,
    aliquotaIss: 4,
    cstPisCofins: '08',
    totalTributos: { tipo: 'nao_informado' }
  });

  const inputPj: EmissaoInput = {
    nDPS: '104',
    tomador: { CNPJ: '99888777000166', xNome: 'Hospital Santa Rita S/A' },
    xDescServ: 'Plantão Médico Especializado',
    vServ: 3000,
    cTribNac: '040101',
    cNBS: '',
    cIndOp: '',
    cClassTrib: '',
    fiscal: { ...params, competencia: hoje }
  };

  const { xml } = gerarXmlDps(inputPj, { ...prestadorSup, regTrib: { ...prestadorSup.regTrib, regEspTrib: 0 } });

  assert.match(xml, /<CNPJ>99888777000166<\/CNPJ>/);
  assert.match(xml, /<tribISSQN>1<\/tribISSQN><tpRetISSQN>2<\/tpRetISSQN><pAliq>4\.00<\/pAliq><\/tribMun>/);
});
