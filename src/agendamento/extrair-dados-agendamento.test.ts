import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  extrairEmailOportunista,
  extrairDataHoraSimples,
  consolidarDadosAgendamento
} from './extrair-dados-agendamento.js';

describe('extrair-dados-agendamento', () => {
  it('deve extrair e-mail oportunista de mensagem de texto', () => {
    const texto = 'Meu e-mail para contato é maria.silva@exemplo.com.br';
    assert.strictEqual(extrairEmailOportunista(texto), 'maria.silva@exemplo.com.br');
  });

  it('deve extrair data e hora de mensagem comum em português', () => {
    const agora = new Date(2026, 8, 1);
    const texto = 'Combinado para dia 28/09 às 14:30';
    const data = extrairDataHoraSimples(texto, agora);

    assert.ok(data !== null);
    assert.strictEqual(data.getDate(), 28);
    assert.strictEqual(data.getMonth(), 8); // Setembro (0-index = 8)
    assert.strictEqual(data.getHours(), 14);
    assert.strictEqual(data.getMinutes(), 30);
  });

  it('deve consolidar dados de agendamento oportunistas de múltiplas mensagens', () => {
    const mensagens = [
      'Olá, gostaria de agendar uma consulta para dia 15/10/2026 às 10:00',
      'O valor da consulta é R$ 350,00',
      'Perfeito! Meu e-mail é paciente@teste.com e meu CPF é 529.982.247-25',
      'Consulta agendada!'
    ];

    const dados = consolidarDadosAgendamento(mensagens);
    assert.strictEqual(dados.valorConsultaCentavos, 35000);
    assert.strictEqual(dados.emailPaciente, 'paciente@teste.com');
    assert.strictEqual(dados.cpfPaciente, '52998224725');
    assert.strictEqual(dados.dataHora.getDate(), 15);
    assert.strictEqual(dados.dataHora.getMonth(), 9); // Outubro
    assert.strictEqual(dados.dataHora.getFullYear(), 2026);
    assert.strictEqual(dados.dataHora.getHours(), 10);
  });
});
