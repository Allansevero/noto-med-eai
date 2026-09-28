import { describe, it } from 'node:test';
import assert from 'node:assert';
import { verificarLimiteEmissao } from './verificar-limite-emissao.js';

describe('verificarLimiteEmissao', () => {
  it('deve permitir emissão no plano gratuito quando abaixo de 5 notas dia', () => {
    const res = verificarLimiteEmissao({
      planoNome: 'Gratuito',
      notasHoje: 3,
      notasMes: 10,
      travaEmissao: false,
      assinaturaStatus: 'trial'
    });

    assert.strictEqual(res.permitido, true);
  });

  it('deve bloquear emissão no plano gratuito quando atinge 5 notas dia', () => {
    const res = verificarLimiteEmissao({
      planoNome: 'Gratuito',
      notasHoje: 5,
      notasMes: 15,
      travaEmissao: false,
      assinaturaStatus: 'trial',
      checkoutUrl: 'https://checkout.stripe.com/test'
    });

    assert.strictEqual(res.permitido, false);
    if (!res.permitido) {
      assert.strictEqual(res.motivo, 'limite_diario_atingido');
      assert.match(res.mensagem, /limite de 5 notas fiscais gratuitas de hoje/);
      assert.match(res.mensagem, /https:\/\/checkout.stripe.com\/test/);
    }
  });

  it('deve permitir emissão no plano mensal quando abaixo de 100 notas no mês mesmo com mais de 5 no dia', () => {
    const res = verificarLimiteEmissao({
      planoNome: 'Mensal',
      limiteNotasMes: 100,
      notasHoje: 12,
      notasMes: 80,
      travaEmissao: false,
      assinaturaStatus: 'ativa'
    });

    assert.strictEqual(res.permitido, true);
  });

  it('deve bloquear emissão no plano mensal quando atinge 100 notas no mês', () => {
    const res = verificarLimiteEmissao({
      planoNome: 'Mensal',
      limiteNotasMes: 100,
      notasHoje: 1,
      notasMes: 100,
      travaEmissao: false,
      assinaturaStatus: 'ativa'
    });

    assert.strictEqual(res.permitido, false);
    if (!res.permitido) {
      assert.strictEqual(res.motivo, 'limite_mensal_atingido');
      assert.match(res.mensagem, /limite de 100 notas fiscais do seu Plano Mensal/);
    }
  });

  it('deve bloquear imediatamente se trava de emissão estiver ativa', () => {
    const res = verificarLimiteEmissao({
      planoNome: 'Mensal',
      notasHoje: 0,
      notasMes: 0,
      travaEmissao: true,
      assinaturaStatus: 'ativa'
    });

    assert.strictEqual(res.permitido, false);
    if (!res.permitido) {
      assert.strictEqual(res.motivo, 'emissao_travada');
    }
  });

  it('deve bloquear se assinatura estiver inadimplente', () => {
    const res = verificarLimiteEmissao({
      planoNome: 'Mensal',
      notasHoje: 0,
      notasMes: 5,
      travaEmissao: false,
      assinaturaStatus: 'inadimplente'
    });

    assert.strictEqual(res.permitido, false);
    if (!res.permitido) {
      assert.strictEqual(res.motivo, 'assinatura_inadimplente');
    }
  });
});
