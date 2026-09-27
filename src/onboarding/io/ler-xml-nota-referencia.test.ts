import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { lerXmlNotaReferencia } from './ler-xml-nota-referencia.js';

describe('lerXmlNotaReferencia', () => {
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
