import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gerarXmlDps } from './gerar-xml-dps.js';
import type { EmissaoInput, ConfigPrestador } from './montar-dps.js';

describe('gerarXmlDps', () => {
  const cfg: ConfigPrestador = {
    cnpj: '12.345.678/0001-95',
    im: '104467',
    codMunicipio: '3550308',
    ambiente: 1, // Produção
    serie: '00001',
    regTrib: {
      opSimpNac: 3,
      regApTribSN: 1,
      regEspTrib: 0
    },
    pTotTribSN: 6.0
  };

  const input: EmissaoInput = {
    nDPS: '1',
    tomador: {
      CPF: '123.456.789-09',
      xNome: 'João da Silva & Cia',
      end: {
        cMun: '3550308',
        CEP: '01001-000',
        xLgr: 'Praça da Sé',
        nro: '100',
        xCpl: 'Apto 101',
        xBairro: 'Sé'
      },
      fone: '11988887777',
      email: 'joao@exemplo.com'
    },
    xDescServ: 'Consulta médica <especialidade>',
    vServ: 250.0,
    cTribNac: '080201',
    cNBS: '122051900',
    cIndOp: '100301',
    cClassTrib: '000001'
  };

  it('omite a inscrição municipal quando ela não estiver cadastrada', () => {
    const resultado = gerarXmlDps(input, { ...cfg, im: '' }, new Date('2026-09-28T12:00:00Z'));

    assert.doesNotMatch(resultado.xml, /<IM>/);
  });

  it('deve gerar XML com id oficial de 42 dígitos e caracteres escapados', () => {
    const res = gerarXmlDps(input, cfg, new Date('2026-09-28T12:00:00Z'));

    assert.ok(res.dpsId.startsWith('DPS'));
    assert.equal(res.dpsId.length, 45); // DPS + 42 dígitos
    assert.equal(res.dpsId, 'DPS355030821234567800019500001000000000000001');

    assert.ok(res.xml.includes('<tpAmb>1</tpAmb>'));
    assert.ok(res.xml.includes('<CNPJ>12345678000195</CNPJ>'));
    assert.ok(res.xml.includes('<CPF>12345678909</CPF>'));
    assert.ok(res.xml.includes('João da Silva &amp; Cia'));
    assert.ok(res.xml.includes('&lt;especialidade&gt;'));
    assert.ok(res.xml.includes('<vServ>250.00</vServ>'));
    assert.ok(res.xml.includes('<cTribNac>080201</cTribNac>'));
    assert.ok(!res.xml.includes('<cNBS>'));
    assert.ok(res.xml.includes(`Id="${res.dpsId}"`));
  });

  it('deve aceitar tomador sem endereço e com CNPJ', () => {
    const inputCnpj: EmissaoInput = {
      ...input,
      tomador: {
        CNPJ: '98.765.432/0001-10',
        xNome: 'Empresa Tomadora Ltda'
      }
    };
    const res = gerarXmlDps(inputCnpj, cfg);
    assert.ok(res.xml.includes('<CNPJ>98765432000110</CNPJ>'));
    assert.ok(!res.xml.includes('<CPF>'));
    assert.ok(!res.xml.includes('<end>'));
  });

  it('deve omitir tribFed, regApTribSN e pTotTribSN (usando indTotTrib=0) quando o emitente for MEI (opSimpNac = 2)', () => {
    const cfgMei: ConfigPrestador = {
      ...cfg,
      regTrib: {
        opSimpNac: 2,
        regApTribSN: 1,
        regEspTrib: 0
      }
    };

    const res = gerarXmlDps(input, cfgMei);
    assert.ok(res.xml.includes('<opSimpNac>2</opSimpNac>'));
    assert.ok(!res.xml.includes('<regApTribSN>'));
    assert.ok(!res.xml.includes('<tribFed>'));
    assert.ok(!res.xml.includes('<piscofins>'));
    assert.ok(!res.xml.includes('<pTotTribSN>'));
    assert.ok(res.xml.includes('<totTrib><indTotTrib>0</indTotTrib></totTrib>'));
    assert.ok(res.xml.includes('<tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>'));
  });

  it('deve incluir tribFed, regApTribSN e pTotTribSN quando o emitente for ME/EPP (opSimpNac = 3)', () => {
    const res = gerarXmlDps(input, cfg);
    assert.ok(res.xml.includes('<opSimpNac>3</opSimpNac>'));
    assert.ok(res.xml.includes('<regApTribSN>1</regApTribSN>'));
    assert.ok(res.xml.includes('<tribFed><piscofins><CST>08</CST></piscofins></tribFed>'));
    assert.ok(res.xml.includes('<totTrib><pTotTribSN>6.00</pTotTribSN></totTrib>'));
  });
});

