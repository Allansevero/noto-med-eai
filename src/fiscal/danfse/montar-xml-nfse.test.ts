import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { montarXmlNfse, type DadosMontagemXmlNfse } from './montar-xml-nfse.js';

describe('montarXmlNfse', () => {
  const dadosBase: DadosMontagemXmlNfse = {
    chaveAcesso: '43149021260933841732000190000000100000000000010192',
    numero: '101',
    serie: '00001',
    competencia: '2026-09-01',
    dataEmissao: '2026-09-27T19:30:00-03:00',
    codigoMunicipio: '4314902',
    prestador: {
      cnpj: '33.841.732/0001-90',
      im: '99887766',
      razaoSocial: '33.841.732 ALLAN MIRANDA SEVERO RODRIGUES',
      nomeFantasia: 'NOTOMED SAUDE',
      endereco: 'RUA DOS ANDRADAS, 1000',
      municipio: 'PORTO ALEGRE',
      uf: 'RS',
      cep: '90000-000',
      telefone: '51993527271',
      email: 'contato@notomed.app',
      simplesNacional: true
    },
    tomador: {
      cpf: '529.982.247-25',
      nome: 'ALLAN SEVERO',
      endereco: 'RUA DOS ANDRADAS, 1000',
      municipio: 'PORTO ALEGRE',
      uf: 'RS',
      cep: '90000-000',
      telefone: '5181936133',
      email: 'paciente@notomed.app'
    },
    servico: {
      cTribNac: '041601',
      cNBS: '122051900',
      discriminacao: 'CONSULTA MÉDICA & AVALIAÇÃO',
      valor: 350,
      aliquota: 2,
      issApurado: 7
    }
  };

  it('deve gerar XML válido com tags de prestador, tomador e serviço', () => {
    const xml = montarXmlNfse(dadosBase);
    assert.ok(xml.startsWith('<?xml version="1.0"'));
    assert.ok(xml.includes('<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse">'));
    assert.ok(xml.includes('<infNFSe Id="NFS43149021260933841732000190000000100000000000010192"'));
    assert.ok(xml.includes('<CNPJ>33841732000190</CNPJ>'));
    assert.ok(xml.includes('<CPF>52998224725</CPF>'));
    assert.ok(xml.includes('<cTribNac>041601</cTribNac>'));
    assert.ok(xml.includes('<vServ>350.00</vServ>'));
  });

  it('deve escapar caracteres especiais como & e < no texto', () => {
    const xml = montarXmlNfse(dadosBase);
    assert.ok(xml.includes('CONSULTA M&Eacute;DICA &amp; AVALIA&Ccedil;&Atilde;O') || xml.includes('CONSULTA MÉDICA &amp; AVALIAÇÃO'));
    assert.ok(!xml.includes('CONSULTA MÉDICA & AVALIAÇÃO'));
  });
});
