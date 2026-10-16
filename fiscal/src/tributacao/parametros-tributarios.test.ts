/**
 * Testes unitários para consolidação de parâmetros fiscais do médico.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { consolidarParametrosFiscais } from './parametros-tributarios.js';

describe('Consolidação de parâmetros tributários em /fiscal', () => {
  it('deve aplicar valores padrão de segurança quando dados vierem parciais', () => {
    const res = consolidarParametrosFiscais({});
    assert.equal(res.optanteSimples, true);
    assert.equal(res.aliquotaIss, 2.01);
    assert.equal(res.codigoTributacaoNacional, '040101');
    assert.ok(res.descricaoServicoPadrao.length > 0);
  });

  it('deve respeitar regime tributário explicitado e alíquota informada', () => {
    const res = consolidarParametrosFiscais({
      regimeTributario: 'lucro_presumido',
      optanteSimples: false,
      aliquotaIss: 5.0,
      codigoTributacaoNacional: '04.01.02'
    });
    assert.equal(res.optanteSimples, false);
    assert.equal(res.aliquotaIss, 5.0);
    assert.equal(res.codigoTributacaoNacional, '040102');
  });
});
