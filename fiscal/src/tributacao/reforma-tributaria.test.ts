/**
 * Testes unitários para regras de Reforma Tributária de serviços de saúde.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ehServicoSaude, sugerirIbscbsSaude } from './reforma-tributaria.js';

describe('Reforma Tributária (IBS/CBS) no serviço /fiscal', () => {
  it('deve reconhecer código nacional 040101 como serviço de saúde', () => {
    assert.equal(ehServicoSaude('040101'), true);
    assert.equal(ehServicoSaude('010101'), false);
  });

  it('deve aplicar benefício constitucional de redução de 60% com CST 200', () => {
    const res = sugerirIbscbsSaude({
      ctribNac: '040101',
      tomadorCpf: true,
      beneficioReducaoSaude: true
    });
    assert.equal(res.CST, '200');
    assert.equal(res.indFinal, '1');
  });

  it('deve retornar CST 999 para prestadores enquadrados como MEI', () => {
    const res = sugerirIbscbsSaude({
      ctribNac: '040101',
      opcaoSimplesNacional: 'mei'
    });
    assert.equal(res.CST, '999');
  });
});
