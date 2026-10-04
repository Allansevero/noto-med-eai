import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { SefinNacionalClient, combinarAutoridadesCertificadoras } from './sefin-nacional-client.js';

describe('SefinNacionalClient', () => {
  it('preserva as autoridades padrão ao acrescentar a cadeia da SEFIN', () => {
    const adicional = Buffer.from('certificado-adicional');
    const autoridades = combinarAutoridadesCertificadoras(adicional);

    assert.ok(autoridades && autoridades.length > 1);
    assert.strictEqual(autoridades?.at(-1), adicional);
  });

  const fakePfx = Buffer.from('dummy-pfx');
  const xmlAssinado = `<?xml version="1.0" encoding="UTF-8"?><DPS xmlns="http://www.sped.fazenda.gov.br/nfse"><infDPS Id="DPS1"><nDPS>1</nDPS></infDPS></DPS>`;

  it('deve processar resposta de autorização bem-sucedida com nfseXmlGZipB64', async () => {
    const chaveEsperada = '35260912345678000195550010000000011234567890123456';
    const xmlNfse = `<?xml version="1.0" encoding="UTF-8"?><NFSe versao="1.01"><infNFSe><chNFSe>${chaveEsperada}</chNFSe><nNFSe>123</nNFSe><nProt>999888777</nProt></infNFSe></NFSe>`;
    const gzipB64 = zlib.gzipSync(Buffer.from(xmlNfse, 'utf-8')).toString('base64');

    const fakeTransmissor = async (url: string, payload: string) => {
      assert.ok(url.includes('sefin.nfse.gov.br'));
      const parsed = JSON.parse(payload);
      assert.ok(parsed.dpsXmlGZipB64);

      return {
        status: 200,
        corpo: JSON.stringify({
          chNFSe: chaveEsperada,
          nNFSe: 123,
          nProt: '999888777',
          nfseXmlGZipB64: gzipB64
        })
      };
    };

    const client = new SefinNacionalClient(fakeTransmissor);
    const resultado = await client.transmitirDps({
      xmlAssinado,
      pfxBuffer: fakePfx,
      senhaCertificado: '1234',
      ambiente: 1 // Produção
    });

    assert.equal(resultado.sucesso, true);
    if (resultado.sucesso) {
      assert.equal(resultado.chaveAcesso, chaveEsperada);
      assert.equal(resultado.numeroNfse, '123');
      assert.equal(resultado.protocoloAutorizacao, '999888777');
      assert.ok(resultado.xmlAutorizado.includes(chaveEsperada));
    }
  });

  it('deve tratar rejeição da SEFIN com erros cadastrais', async () => {
    const fakeTransmissor = async () => {
      return {
        status: 422,
        corpo: JSON.stringify({
          erros: [
            { Codigo: 'E0116', Descricao: 'Inscrição Municipal não cadastrada no município de incidência' }
          ]
        })
      };
    };

    const client = new SefinNacionalClient(fakeTransmissor);
    const resultado = await client.transmitirDps({
      xmlAssinado,
      pfxBuffer: fakePfx,
      senhaCertificado: '1234',
      ambiente: 1
    });

    assert.equal(resultado.sucesso, false);
    if (!resultado.sucesso) {
      assert.equal(resultado.codigoErro, 'E0116');
      assert.ok(resultado.motivo.includes('E0116'));
      assert.ok(resultado.motivo.includes('Inscrição Municipal'));
    }
  });

  it('deve apontar para ambiente de homologação quando ambiente=2', async () => {
    let urlChamada = '';
    const fakeTransmissor = async (url: string) => {
      urlChamada = url;
      return {
        status: 200,
        corpo: JSON.stringify({
          chNFSe: '35260912345678000195550010000000011234567890123456'
        })
      };
    };

    const client = new SefinNacionalClient(fakeTransmissor);
    await client.transmitirDps({
      xmlAssinado,
      pfxBuffer: fakePfx,
      senhaCertificado: '1234',
      ambiente: 2 // Homologação
    });

    assert.ok(urlChamada.includes('producaorestrita.nfse.gov.br'));
  });
});

for (const codigo of ['EAI_AGAIN', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET']) {
  it(`classifica evidência de envio para ${codigo}`, async () => {
    const client = new SefinNacionalClient(async () => { throw Object.assign(new Error('rede'), { code: codigo }); });
    const resultado = await client.transmitirDps({ xmlAssinado: '<DPS/>', pfxBuffer: Buffer.from('pfx'), senhaCertificado: 'senha', ambiente: 2 });
    assert.equal(resultado.sucesso, false);
    if (!resultado.sucesso) assert.equal(resultado.falhaAntesDoEnvio,
      ['EAI_AGAIN', 'ECONNREFUSED'].includes(codigo) ? codigo : undefined);
  });
}
