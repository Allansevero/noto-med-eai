import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  extrairDadosAgendamentoComIa,
  mesclarDadosHeuristicosEIA
} from './extrair-dados-agendamento-ia.js';
import type { ExtratorIaService, DadosExtracaoIa } from '../ia/extrator-ia-service.js';

describe('extrairDadosAgendamentoComIa', () => {
  it('combina dados da IA com dados heurísticos quando a IA tem sucesso', async () => {
    const mockIa: ExtratorIaService = {
      async extrairDados(): Promise<DadosExtracaoIa> {
        return {
          nomePaciente: 'Beatriz Lima',
          cpfPaciente: '98765432100',
          dataHoraIso: '2026-09-29T15:30:00.000Z',
          valorConsultaCentavos: 45000,
          emailPaciente: 'beatriz@email.com'
        };
      }
    };

    const mensagens = ['Consulta marcada para Beatriz R$ 450'];
    const resultado = await extrairDadosAgendamentoComIa(mensagens, { iaService: mockIa });

    assert.equal(resultado.nomePaciente, 'Beatriz Lima');
    assert.equal(resultado.cpfPaciente, '98765432100');
    assert.equal(resultado.valorConsultaCentavos, 45000);
    assert.equal(resultado.emailPaciente, 'beatriz@email.com');
  });

  it('faz fallback para regex heurística se a IA falhar ou lançar erro', async () => {
    const mockIaFalha: ExtratorIaService = {
      async extrairDados(): Promise<DadosExtracaoIa> {
        throw new Error('Timeout da API');
      }
    };

    const mensagens = [
      'Agendado para 28/09 às 14:30',
      'Valor R$ 350,00',
      'CPF 529.982.247-25'
    ];
    const agora = new Date(2026, 8, 25);
    const resultado = await extrairDadosAgendamentoComIa(mensagens, { iaService: mockIaFalha, agora });

    assert.equal(resultado.valorConsultaCentavos, 35000);
    assert.equal(resultado.cpfPaciente, '52998224725');
    assert.equal(resultado.dataHora.getDate(), 28);
    assert.equal(resultado.dataHora.getHours(), 14);
  });

  it('mesclarDadosHeuristicosEIA prioriza dados não-nulos da IA', () => {
    const heuris = {
      dataHora: new Date(2026, 8, 25),
      valorConsultaCentavos: 20000,
      cpfPaciente: '11122233344'
    };
    const ia = {
      nomePaciente: 'Roberto',
      valorConsultaCentavos: 25000
    };

    const mesclado = mesclarDadosHeuristicosEIA(heuris, ia);
    assert.equal(mesclado.nomePaciente, 'Roberto');
    assert.equal(mesclado.valorConsultaCentavos, 25000);
    assert.equal(mesclado.cpfPaciente, '11122233344');
  });
});
