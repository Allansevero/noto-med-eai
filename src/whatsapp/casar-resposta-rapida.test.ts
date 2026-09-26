import { describe, it } from 'node:test';
import assert from 'node:assert';
import { casarRespostaRapida } from './casar-resposta-rapida.js';

describe('casarRespostaRapida', () => {
  it('deve rejeitar se a mensagem não foi enviada pelo médico (fromMe: false)', () => {
    const res = casarRespostaRapida('Consulta agendada!', false);
    assert.strictEqual(res.casou, false);
    if (!res.casou) {
      assert.strictEqual(res.motivo, 'nao_e_from_me');
    }
  });

  it('deve rejeitar mensagem sem texto', () => {
    const res = casarRespostaRapida('', true);
    assert.strictEqual(res.casou, false);
    if (!res.casou) {
      assert.strictEqual(res.motivo, 'sem_texto');
    }
  });

  it('deve casar comando de agendado com modelo padrão', () => {
    const res = casarRespostaRapida('Consulta agendada!', true);
    assert.strictEqual(res.casou, true);
    if (res.casou) {
      assert.strictEqual(res.tipo, 'agendado');
    }
  });

  it('deve casar comando de agendado com modelo customizado do médico', () => {
    const custom = [
      { tipo: 'agendado' as const, textoModelo: 'Atendimento marcado com sucesso' },
      { tipo: 'emissao' as const, textoModelo: 'Nota fiscal saindo no valor de' }
    ];
    const res = casarRespostaRapida('Atendimento marcado com sucesso para amanhã', true, custom);
    assert.strictEqual(res.casou, true);
    if (res.casou) {
      assert.strictEqual(res.tipo, 'agendado');
    }
  });

  it('deve casar comando de emissão com valor digitado pelo médico', () => {
    const texto = 'Vou enviar em instantes sua NF no valor de R$ 450,00';
    const res = casarRespostaRapida(texto, true);
    assert.strictEqual(res.casou, true);
    if (res.casou) {
      assert.strictEqual(res.tipo, 'emissao');
      assert.strictEqual(res.valorDigitadoCentavos, 45000);
    }
  });

  it('deve casar comando de emissão sem valor digitado (valor em aberto)', () => {
    const texto = 'Vou enviar em instantes sua NF no valor de R$';
    const res = casarRespostaRapida(texto, true);
    assert.strictEqual(res.casou, true);
    if (res.casou) {
      assert.strictEqual(res.tipo, 'emissao');
      assert.strictEqual(res.valorDigitadoCentavos, null);
    }
  });

  it('deve retornar nenhum_modelo_casado para mensagens comuns', () => {
    const res = casarRespostaRapida('Bom dia! Como você está se sentindo hoje?', true);
    assert.strictEqual(res.casou, false);
    if (!res.casou) {
      assert.strictEqual(res.motivo, 'nenhum_modelo_casado');
    }
  });
});
