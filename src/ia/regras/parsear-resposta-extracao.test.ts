import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsearRespostaExtracao,
  sanitizarJsonBruto,
  normalizarCpfExtracao,
  normalizarValorCentavos
} from './parsear-resposta-extracao.js';

describe('parsearRespostaExtracao', () => {
  it('remove blocos markdown e faz parse de JSON estruturado', () => {
    const raw = '```json\n{"nome_paciente": "Carlos Andrade", "cpf": "123.456.789-00", "valor_centavos": 35000, "data": "2026-09-28", "horario": "14:30"}\n```';
    const resultado = parsearRespostaExtracao(raw);

    assert.equal(resultado.nomePaciente, 'Carlos Andrade');
    assert.equal(resultado.cpfPaciente, '12345678900');
    assert.equal(resultado.valorConsultaCentavos, 35000);
    assert.equal(resultado.dataConsulta, '2026-09-28');
    assert.equal(resultado.horaConsulta, '14:30');
    assert.ok(resultado.dataHoraIso?.includes('2026-09-28'));
  });

  it('converte valor_reais em centavos quando valor_centavos não vier direto', () => {
    const raw = '{"nome_paciente": "Mariana", "valor_reais": 450.50}';
    const resultado = parsearRespostaExtracao(raw);

    assert.equal(resultado.nomePaciente, 'Mariana');
    assert.equal(resultado.valorConsultaCentavos, 45050);
  });

  it('retorna objeto vazio com segurança se o JSON for inválido', () => {
    const raw = 'isto nao é um json';
    const resultado = parsearRespostaExtracao(raw);

    assert.deepEqual(resultado, {});
  });

  it('normaliza CPF descartando pontuação e verificando 11 dígitos', () => {
    assert.equal(normalizarCpfExtracao('123.456.789-01'), '12345678901');
    assert.equal(normalizarCpfExtracao('123'), null);
    assert.equal(normalizarCpfExtracao(undefined), null);
  });
});
