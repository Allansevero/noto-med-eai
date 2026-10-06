import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarConfig } from '../config.js';

test('área de teste está desativada por padrão e exige segredo próprio ao ativar', () => {
  assert.equal(carregarConfig({}).desenvolvedorFiscalAtivo, false);
  for (const token of [undefined, '', 'curto']) {
    assert.throws(() => carregarConfig({ DESENVOLVEDOR_FISCAL_ATIVO: 'true', DESENVOLVEDOR_FISCAL_TOKEN: token }), /DESENVOLVEDOR_FISCAL_TOKEN/);
  }
  const cfg = carregarConfig({ DESENVOLVEDOR_FISCAL_ATIVO: 'true', DESENVOLVEDOR_FISCAL_TOKEN: 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres' });
  assert.equal(cfg.desenvolvedorFiscalAtivo, true);
  assert.equal(cfg.preparacaoFiscalAtiva, false);
});
