import assert from 'node:assert/strict';
import test from 'node:test';
import { interpretarRespostaMedico } from './interpretar-resposta-medico.js';

test('interpreta respostas afirmativas comuns', () => {
  for (const entrada of ['sim', 'Sim', 'pode', 'PODE EMITIR', 'emite', 'confirmo', 'ok', '1', 'claro']) {
    const r = interpretarRespostaMedico(entrada);
    assert.equal(r.acao, 'aprovar', `Esperava aprovar para: "${entrada}"`);
  }
});

test('interpreta respostas negativas comuns', () => {
  for (const entrada of ['não', 'nao', 'cancela', 'cancelar', 'recusar', '2', 'agora não']) {
    const r = interpretarRespostaMedico(entrada);
    assert.equal(r.acao, 'recusar', `Esperava recusar para: "${entrada}"`);
  }
});

test('interpreta quando o médico envia CPF válido', () => {
  // CPF válido gerado para testes (dígitos verificadores corretos: 529.982.247-25)
  const r = interpretarRespostaMedico('o cpf dela é 529.982.247-25 pode emitir');
  assert.equal(r.acao, 'fornecer_cpf');
  if (r.acao === 'fornecer_cpf') {
    assert.equal(r.cpf, '52998224725');
  }
});

test('interpreta pedido para solicitar CPF ao paciente', () => {
  for (const entrada of ['pedir', 'pede', 'solicitar', 'solicite', 'pede pra ele']) {
    const r = interpretarRespostaMedico(entrada);
    assert.equal(r.acao, 'pedir_cpf_paciente', `Esperava pedir_cpf_paciente para: "${entrada}"`);
  }
});

test('interpreta aprovação com ajuste de valor monetário', () => {
  const r = interpretarRespostaMedico('pode emitir, mas valor 400');
  assert.equal(r.acao, 'aprovar');
  if (r.acao === 'aprovar') {
    assert.equal(r.valorAjustadoCentavos, 40000);
  }
});

test('ignora mensagens não relacionadas ou vazias', () => {
  assert.equal(interpretarRespostaMedico('').acao, 'ignorar');
  assert.equal(interpretarRespostaMedico('boa tarde').acao, 'ignorar');
  assert.equal(interpretarRespostaMedico('qual o endereço do consultório?').acao, 'ignorar');
});
