import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { AdnNfseClient } from './adn-nfse-client.js';

describe('AdnNfseClient', () => {
  const pfx = Buffer.from('certificado-teste');
  const documento = '12345678000195';
  const xmlAntigo = `<NFSe><infNFSe><emit><CNPJ>${documento}</CNPJ></emit><nNFSe>1</nNFSe></infNFSe></NFSe>`;
  const xmlRecente = `<NFSe><infNFSe><emit><CNPJ>${documento}</CNPJ></emit><nNFSe>99</nNFSe></infNFSe></NFSe>`;

  it('encontra a emissão no meio do histórico mesmo com notas recebidas no último lote', async () => {
    const itens = Array.from({ length: 150 }, (_, i) => ({ NSU: i + 1,
      ArquivoXml: i === 74 ? xmlRecente : xmlAntigo.replace(documento, '11222333000181') }));
    const transmissor = async (url: string) => {
      const cursor = Number(new URL(url).pathname.split('/').at(-1));
      return { status: 200, corpo: JSON.stringify({ MaxNSU: 150, LoteDFe: itens.filter(d => d.NSU > cursor).slice(0, 50) }) };
    };
    const resultado = await new AdnNfseClient(transmissor).buscarNfseMaisRecente(pfx, 'senha', documento);
    assert.equal(resultado.documento.nsu, 75);
  });

  it('não usa referência antiga quando a API deixa de avançar antes do fim do histórico', async () => {
    const transmissor = async () => ({ status: 200, corpo: JSON.stringify({ MaxNSU: 100,
      LoteDFe: [{ NSU: 1, ArquivoXml: xmlAntigo }] }) });
    await assert.rejects(() => new AdnNfseClient(transmissor).buscarNfseMaisRecente(pfx, 'senha', documento), /incompleta/i);
  });

  it('deve consultar o ultimo lote e devolver a NFS-e mais recente', async () => {
    const urls: string[] = [];
    const transmissor = async (url: string) => {
      urls.push(url);
      if (url.includes('/DFe/0?')) {
        return {
          status: 200,
          corpo: JSON.stringify({
            StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS',
            MaxNSU: 120,
            LoteDFe: [{ NSU: 1, ArquivoXml: Buffer.from(xmlAntigo).toString('base64') }]
          })
        };
      }
      return {
        status: 200,
        corpo: JSON.stringify({
          StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS',
          MaxNSU: 120,
          LoteDFe: [
            { NSU: 119, TipoDocumento: 'EVENTO', ArquivoXml: Buffer.from('<Evento/>').toString('base64') },
            { NSU: 120, ChaveAcesso: 'chave-99', DataHoraGeracao: '2026-09-29T01:00:00Z', ArquivoXml: zlib.gzipSync(Buffer.from(xmlRecente)).toString('base64') }
          ]
        })
      };
    };

    const resultado = await new AdnNfseClient(transmissor).buscarNfseMaisRecente(pfx, 'senha', documento);

    assert.equal(urls.length, 2);
    assert.ok(urls[0].includes('/DFe/0?lote=true'));
    assert.ok(urls[1].includes('/DFe/1?lote=true'));
    assert.equal(urls.some((url) => url.includes('cnpjConsulta')), false);
    assert.equal(resultado.documento.nsu, 120);
    assert.equal(resultado.documento.chaveAcesso, 'chave-99');
    assert.equal(resultado.documento.xml, xmlRecente);
  });

  it('deve informar quando nao houver NFS-e para o certificado', async () => {
    const transmissor = async () => ({
      status: 200,
      corpo: JSON.stringify({ StatusProcessamento: 'NENHUM_DOCUMENTO_LOCALIZADO', MaxNSU: 0, LoteDFe: [] })
    });

    await assert.rejects(
      () => new AdnNfseClient(transmissor).buscarNfseMaisRecente(pfx, 'senha', documento),
      /ADN não retornou documentos fiscais/
    );
  });

  it('deve explicar quando o ADN devolver NFS-e apenas de outro emitente', async () => {
    const transmissor = async () => ({
      status: 200,
      corpo: JSON.stringify({
        StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS',
        MaxNSU: 1,
        LoteDFe: [{
          NSU: 1,
          ArquivoXml: Buffer.from('<NFSe><infNFSe><emit><CNPJ>11222333000181</CNPJ></emit></infNFSe></NFSe>').toString('base64')
        }]
      })
    });

    await assert.rejects(
      () => new AdnNfseClient(transmissor).buscarNfseMaisRecente(pfx, 'senha', documento),
      /retornou 1 NFS-e\(s\), mas nenhuma foi emitida/
    );
  });

  it('deve ignorar nota recebida como tomador e usar apenas nota emitida pelo titular', async () => {
    const xmlOutroPrestador = '<NFSe><infNFSe><emit><CNPJ>11222333000181</CNPJ></emit><nNFSe>200</nNFSe></infNFSe></NFSe>';
    const transmissor = async () => ({
      status: 200,
      corpo: JSON.stringify({
        StatusProcessamento: 'DOCUMENTOS_LOCALIZADOS',
        MaxNSU: 2,
        LoteDFe: [
          { NSU: 1, DataHoraGeracao: '2026-09-28T10:00:00Z', ArquivoXml: Buffer.from(xmlAntigo).toString('base64') },
          { NSU: 2, DataHoraGeracao: '2026-09-29T10:00:00Z', ArquivoXml: Buffer.from(xmlOutroPrestador).toString('base64') }
        ]
      })
    });

    const resultado = await new AdnNfseClient(transmissor).buscarNfseMaisRecente(pfx, 'senha', documento);
    assert.equal(resultado.documento.nsu, 1);
  });

  it('deve traduzir limite temporario do ADN', async () => {
    const transmissor = async () => ({ status: 429, corpo: '{}' });
    await assert.rejects(
      () => new AdnNfseClient(transmissor).buscarNfseMaisRecente(pfx, 'senha', documento),
      /limitou temporariamente/
    );
  });
});
