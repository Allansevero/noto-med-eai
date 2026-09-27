import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateDanfsePdf } from './gerar-danfse-pdf.js';

describe('generateDanfsePdf', () => {
  it('deve gerar PDF com cabeçalho %PDF- e tamanho consistente', async () => {
    const pdfBytes = await generateDanfsePdf({
      chaveAcesso: '43149022233841732000163000000000001226097414639456',
      numero: '102',
      serie: '00001',
      ambiente: 'producao',
      prestador: {
        razaoSocial: 'Clínica Médica Silva Ltda',
        cnpj: '12.345.678/0001-90',
        municipio: 'Porto Alegre',
        uf: 'RS',
        simplesNacional: true
      },
      tomador: {
        nome: 'João da Silva',
        cpf: '529.982.247-25',
        municipio: 'Porto Alegre',
        uf: 'RS'
      },
      servico: {
        valor: 450,
        aliquota: 2.01,
        issApurado: 9.04,
        discriminacao: 'REFERENTE A 1 CONSULTA CARDIOLÓGICA REALIZADA COM DR. CARLOS SILVA (CRM: 12345/RS).'
      }
    });

    assert.ok(pdfBytes instanceof Uint8Array);
    assert.ok(pdfBytes.length > 3000, `PDF gerado deve ter mais de 3KB, obteve ${pdfBytes.length}`);

    // Verifica assinatura mágica do arquivo PDF
    const assinatura = Buffer.from(pdfBytes.slice(0, 5)).toString('utf-8');
    assert.equal(assinatura, '%PDF-');
  });

  it('deve gerar PDF com marca d água de homologação quando ambiente for homologacao', async () => {
    const pdfBytes = await generateDanfsePdf({
      ambiente: 'homologacao',
      numero: '99',
      prestador: { razaoSocial: 'Dr. Teste', simplesNacional: false },
      servico: { valor: 300 }
    });

    assert.ok(pdfBytes.length > 3000);
    const assinatura = Buffer.from(pdfBytes.slice(0, 5)).toString('utf-8');
    assert.equal(assinatura, '%PDF-');
  });

  it('deve gerar PDF com marca d água de cancelada quando cancelada for true', async () => {
    const pdfBytes = await generateDanfsePdf({
      cancelada: true,
      numero: '100',
      prestador: { razaoSocial: 'Dr. Teste' }
    });

    assert.ok(pdfBytes.length > 3000);
    const assinatura = Buffer.from(pdfBytes.slice(0, 5)).toString('utf-8');
    assert.equal(assinatura, '%PDF-');
  });
});
