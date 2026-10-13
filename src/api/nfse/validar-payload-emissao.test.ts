/**
 * Testes unitários para validarPayloadEmissao.
 * Executados via test runner nativo do Node.js sem mock de banco de dados.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validarPayloadEmissao } from './validar-payload-emissao.js';

describe('validarPayloadEmissao', () => {
  const payloadValido = {
    ref: 'atend_12345',
    medicoId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    valor: 350.50,
    paciente: {
      nome: 'Carlos Drummond',
      cpf: '529.982.247-25',
      telefone: '11999998888',
      email: 'carlos@example.com'
    },
    discriminacao: 'Consulta médica psiquiátrica'
  };

  it('deve aceitar payload válido com conversão de valor para centavos e CPF limpo', () => {
    const res = validarPayloadEmissao(payloadValido);
    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.dados.ref, 'atend_12345');
      assert.strictEqual(res.dados.valorCentavos, 35050);
      assert.strictEqual(res.dados.paciente.cpfLimpo, '52998224725');
      assert.strictEqual(res.dados.paciente.nome, 'Carlos Drummond');
    }
  });

  it('deve rejeitar payload nulo ou não-objeto', () => {
    const res = validarPayloadEmissao(null);
    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.erro.codigo, 'requisicao_invalida');
    }
  });

  it('deve rejeitar ausência de ref', () => {
    const res = validarPayloadEmissao({ ...payloadValido, ref: '' });
    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.erro.campo, 'ref');
    }
  });

  it('deve rejeitar valor zerado ou negativo', () => {
    const resZero = validarPayloadEmissao({ ...payloadValido, valor: 0 });
    assert.strictEqual(resZero.ok, false);
    if (!resZero.ok) {
      assert.strictEqual(resZero.erro.campo, 'valor');
    }

    const resNeg = validarPayloadEmissao({ ...payloadValido, valor: -50 });
    assert.strictEqual(resNeg.ok, false);
  });

  it('deve rejeitar CPF inválido do paciente', () => {
    const res = validarPayloadEmissao({
      ...payloadValido,
      paciente: {
        ...payloadValido.paciente,
        cpf: '111.111.111-11'
      }
    });
    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.erro.campo, 'paciente.cpf');
    }
  });

  it('deve rejeitar nome muito curto de paciente', () => {
    const res = validarPayloadEmissao({
      ...payloadValido,
      paciente: {
        ...payloadValido.paciente,
        nome: 'A'
      }
    });
    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.erro.campo, 'paciente.nome');
    }
  });
});
