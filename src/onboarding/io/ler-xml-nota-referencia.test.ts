import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lerXmlNotaReferencia } from './ler-xml-nota-referencia.js';

describe('lerXmlNotaReferencia', () => {
  const nota = (versao = '1.00') => `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="${versao}"><infNFSe>
    <emit><CNPJ>54969416000141</CNPJ></emit><DPS versao="${versao}"><infDPS><prest><CNPJ>54969416000141</CNPJ></prest></infDPS></DPS>
    </infNFSe></NFSe>`;
  it('lê referência nacional 1.00 sem converter sua versão ou inventar IBS/CBS', () => {
    const resultado = lerXmlNotaReferencia(nota());
    assert.equal(resultado.versao, '1.00');
    assert.equal(resultado.xmlObj.NFSe['@_versao'], '1.00');
    assert.equal(resultado.xmlObj.NFSe.infNFSe.DPS.infDPS.IBSCBS, undefined);
  });
  it('lê namespace nacional com prefixo e DPS de versão reconhecida diferente da NFSe', () => {
    const xml = nota('1.01').replace('<DPS versao="1.01">', '<DPS versao="1.00">')
      .replace('xmlns=', 'xmlns:n=').replace(/<(\/?)([A-Za-z][\w]*)/g, '<$1n:$2');
    assert.equal(lerXmlNotaReferencia(xml).versao, '1.01');
  });
  it('distingue versão futura sem suporte, namespace incorreto e ausência de DPS', () => {
    for (const [xml, codigo] of [
      [nota('1.02'), 'VERSAO_NAO_SUPORTADA'],
      [nota().replace('http://www.sped.fazenda.gov.br/nfse', 'https://outro.exemplo'), 'LAYOUT_NAO_SUPORTADO'],
      [nota().replace(/<DPS[\s\S]*?<\/DPS>/, ''), 'DPS_AUSENTE']
    ]) {
      assert.throws(() => lerXmlNotaReferencia(xml), (erro: any) => {
        assert.equal(erro.codigo, codigo);
        assert.ok(!JSON.stringify(erro.diagnostico).includes('54969416000141'));
        return true;
      });
    }
  });
  it('deve fazer parse com sucesso de XML Padrão Nacional', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
    <NFSe xmlns="http://www.sped.fazenda.gov.br/nfse">
      <infNFSe versao="1.01">
        <emit>
          <CNPJ>54969416000141</CNPJ>
          <IM>104467</IM>
          <xNome>DRA MARTINA</xNome>
        </emit>
        <DPS>
          <infDPS>
            <serie>49999</serie>
            <nDPS>215</nDPS>
            <cLocEmi>4300406</cLocEmi>
          </infDPS>
        </DPS>
      </infNFSe>
    </NFSe>`;

    const res = lerXmlNotaReferencia(xml);
    assert.equal(res.versao, '1.01');
    assert.ok(res.xmlObj);
  });

  it('deve rejeitar XML do padrão municipal ABRASF legado com mensagem amigável', () => {
    const abrasfXml = `<CompNfse><tcInfNfse><Numero>123</Numero></tcInfNfse></CompNfse>`;
    assert.throws(
      () => lerXmlNotaReferencia(abrasfXml),
      /padrão municipal legado \(ABRASF\)/
    );
  });

  it('deve rejeitar string vazia', () => {
    assert.throws(() => lerXmlNotaReferencia(''), /não pode ser vazio/);
  });
});
