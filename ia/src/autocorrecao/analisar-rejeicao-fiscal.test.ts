/**
 * Testes unitários para o motor de autocorreção fiscal autônomo em /ia.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticarEAutocorrigirFalha } from './analisar-rejeicao-fiscal.js';

describe('Autocorreção Fiscal Autônoma em /ia', () => {
  it('deve diagnosticar e corrigir autonomamente erro de enquadramento MEI x ME (E172)', () => {
    const res = diagnosticarEAutocorrigirFalha({
      medicoId: 'med-1',
      pedidoId: 'ped-1',
      erroSefin: {
        codigo: 'E172',
        mensagem: 'Contribuinte optante pelo Simples Nacional não enquadrado como MEI'
      },
      dadosNota: {},
      parametrosAtuais: { regimeTributario: 'mei' }
    });

    assert.equal(res.diagnostico, 'conflito_regime_tributario_mei');
    assert.equal(res.podeCorrigirAutonomamente, true);
    assert.equal(res.acaoRecomendada.tipo, 'atualizar_parametro_fiscal_e_reemitir');
    assert.equal(res.acaoRecomendada.alteracoesParametros?.regimeTributario, 'simples_nacional_microempresa');
  });

  it('deve diagnosticar e corrigir divergência de alíquota do ISS municipal (E170)', () => {
    const res = diagnosticarEAutocorrigirFalha({
      medicoId: 'med-1',
      pedidoId: 'ped-2',
      erroSefin: {
        codigo: 'E170',
        mensagem: 'Alíquota informada não permitida para o código de tributação'
      },
      dadosNota: {},
      parametrosAtuais: { aliquotaIss: 5.0 }
    });

    assert.equal(res.diagnostico, 'aliquota_iss_divergente');
    assert.equal(res.podeCorrigirAutonomamente, true);
    assert.equal(res.acaoRecomendada.alteracoesParametros?.aliquotaIss, 2.01);
  });
});
