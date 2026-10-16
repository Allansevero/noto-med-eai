/**
 * Testes unitários para geração de DANFSE em PDF via pdf-lib.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { gerarDanfsePdf } from './gerar-danfse-pdf.js';

describe('Geração de DANFSE PDF em /fiscal', () => {
  it('deve gerar buffer de PDF válido contendo cabeçalho e dados de emissão', async () => {
    const pdfBytes = await gerarDanfsePdf({
      numeroNota: '105',
      serie: '1',
      chaveAcesso: '35261012345678000195000000000000000000000001',
      dataEmissao: '2026-10-16T14:00:00.000Z',
      prestador: {
        nome: 'DR JOAO DA SILVA CLINICA MEDICA LTDA',
        documento: '12345678000195'
      },
      tomador: {
        nome: 'MARIA APARECIDA OLIVEIRA',
        documento: '12345678901'
      },
      servico: {
        discriminacao: 'Consulta médica clínica realizada em 12/10/2026',
        valorCentavos: 45000,
        aliquotaIss: 2.01
      }
    });

    assert.ok(pdfBytes instanceof Uint8Array);
    assert.ok(pdfBytes.length > 500);

    // O cabeçalho padrão de arquivos PDF começa com "%PDF-"
    const cabecalho = Buffer.from(pdfBytes.slice(0, 5)).toString('utf-8');
    assert.equal(cabecalho, '%PDF-');
  });
});
