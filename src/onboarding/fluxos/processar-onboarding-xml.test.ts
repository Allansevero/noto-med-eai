import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processarOnboardingXml, type ProcessarOnboardingXmlDeps } from './processar-onboarding-xml.js';

describe('processarOnboardingXml', () => {
  const fakePool = {
    query: async () => ({ rows: [] })
  } as any;

  const fakeSupabase = {
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: 'teste.xml' }, error: null })
      })
    }
  } as any;

  const deps: ProcessarOnboardingXmlDeps = {
    pool: fakePool,
    supabase: fakeSupabase,
    chaveCriptografia: 'chave-teste-32-chars-segura-12345',
    pepperCpf: 'pepper-teste-12345'
  };

  const xmlNacional = `<?xml version="1.0" encoding="utf-8"?>
  <NFSe xmlns="http://www.sped.fazenda.gov.br/nfse">
    <infNFSe versao="1.01">
      <emit>
        <CNPJ>54969416000141</CNPJ>
        <IM>104467</IM>
        <xNome>MARTINA BECKER</xNome>
        <xFant>MB CLINICA</xFant>
      </emit>
      <cLocIncid>4300406</cLocIncid>
      <nNFSe>215</nNFSe>
      <DPS>
        <infDPS>
          <serie>49999</serie>
          <nDPS>215</nDPS>
          <cLocEmi>4300406</cLocEmi>
          <prest>
            <CNPJ>54969416000141</CNPJ>
            <regTrib>
              <opSimpNac>3</opSimpNac>
              <regApTribSN>1</regApTribSN>
              <regEspTrib>0</regEspTrib>
            </regTrib>
          </prest>
          <serv>
            <cServ>
              <cTribNac>040303</cTribNac>
              <cTribMun>004</cTribMun>
              <cIntContrib>8630503</cIntContrib>
              <xDescServ>CONSULTA EM PSIQUIATRIA</xDescServ>
            </cServ>
          </serv>
          <valores>
            <vServPrest><vServ>380.00</vServ></vServPrest>
            <trib>
              <tribMun>
                <pAliq>2.72</pAliq>
              </tribMun>
            </trib>
          </valores>
        </infDPS>
      </DPS>
    </infNFSe>
  </NFSe>`;

  it('deve orquestrar a leitura, extração e persistência do XML com sucesso', async () => {
    const res = await processarOnboardingXml(deps, 'medico-uuid-123', xmlNacional);

    assert.equal(res.ok, true);
    assert.equal(res.versao, '1.01');
    assert.equal(res.parametros.cnpj, '54969416000141');
    assert.equal(res.parametros.inscricaoMunicipal, '104467');
    assert.equal(res.parametros.razaoSocial, 'MARTINA BECKER');
    assert.equal(res.servico.ctribNac, '040303');
    assert.equal(res.servico.ctribMun, '004');
    assert.equal(res.servico.especialidadeSugerida, 'Psiquiatria');
  });

  it('deve rejeitar XML inválido ou legado', async () => {
    await assert.rejects(
      async () => processarOnboardingXml(deps, 'medico-uuid-123', '<xml>invalido</xml>'),
      /O XML não contém grupo de emissor/
    );
  });
});
