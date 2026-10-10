/**
 * Testes unitários para criação de solicitação a partir de comprovante validado.
 * Valida os fluxos com paciente com CPF, paciente sem CPF (disparo da mensagem humanizada)
 * e opções de preferência de data de consulta ('mesma_do_comprovante' vs 'perguntar_uma_a_uma').
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { criarSolicitacaoComprovante } from './criar-solicitacao-comprovante.js';
import type { EnviarMensagemPaciente } from '../../whatsapp/enviar-mensagem-paciente.js';

describe('criarSolicitacaoComprovante', () => {
  function criarMockPool(params: {
    crmMedico?: string | null;
    paciente: { id: string; nome: string; telefone: string; cpf_cnpj_hash: string | null };
  }) {
    const queries: string[] = [];

    const mockClient = {
      query: async (sql: string, args?: any[]) => {
        queries.push(sql);
        if (sql === 'begin' || sql === 'commit' || sql === 'rollback') {
          return { rows: [] };
        }
        if (sql.includes('from medicos')) {
          return { rows: [{ crm: params.crmMedico ?? '123456/SP' }] };
        }
        if (sql.includes('from pacientes')) {
          return { rows: [params.paciente] };
        }
        if (sql.includes('insert into solicitacoes_nota')) {
          return { rows: [{ id: 'sol-uuid-123' }] };
        }
        if (sql.includes('update whatsapp_conversas')) {
          return { rows: [] };
        }
        if (sql.includes('medico_servicos_fiscais')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
      release: () => {}
    };

    return {
      queries,
      pool: {
        connect: async () => mockClient
      } as any
    };
  }

  it('deve criar solicitação quando paciente tem CPF e preferência é mesma do comprovante', async () => {
    const { pool, queries } = criarMockPool({
      crmMedico: '54321/SP',
      paciente: { id: 'pac-1', nome: 'João da Silva', telefone: '5511999998888', cpf_cnpj_hash: 'hash-cpf-123' }
    });

    let mensagemEnviada = false;
    const enviador: EnviarMensagemPaciente = {
      enviarTexto: async () => {
        mensagemEnviada = true;
        return { sucesso: true };
      }
    };

    const resultado = await criarSolicitacaoComprovante(pool, enviador, {
      medicoId: 'med-1',
      pacienteId: 'pac-1',
      instanciaNome: 'inst-1',
      preferenciaData: 'mesma_do_comprovante',
      comprovante: {
        mensagemId: 'msg-1',
        timestamp: Date.now(),
        valorCentavos: 35000,
        valorFormatado: 'R$ 350,00',
        dataPagamento: '2026-10-05'
      }
    });

    assert.equal(resultado.solicitacaoId, 'sol-uuid-123');
    assert.equal(resultado.aguardandoCpf, false);
    assert.equal(resultado.aguardandoDataConsulta, false);
    assert.equal(resultado.mensagemCpfEnviada, false);
    assert.equal(mensagemEnviada, false);
  });

  it('deve pedir CPF diretamente sem falar que é IA quando paciente não tem CPF', async () => {
    const { pool, queries } = criarMockPool({
      crmMedico: '54321/SP',
      paciente: { id: 'pac-2', nome: 'Maria Santos', telefone: '5511977776666', cpf_cnpj_hash: null }
    });

    let textoEnviado = '';
    const enviador: EnviarMensagemPaciente = {
      enviarTexto: async (p) => {
        textoEnviado = p.texto;
        return { sucesso: true };
      }
    };

    const resultado = await criarSolicitacaoComprovante(pool, enviador, {
      medicoId: 'med-1',
      pacienteId: 'pac-2',
      instanciaNome: 'inst-1',
      preferenciaData: 'perguntar_uma_a_uma',
      comprovante: {
        mensagemId: 'msg-2',
        timestamp: Date.now(),
        valorCentavos: 40000,
        valorFormatado: 'R$ 400,00',
        dataPagamento: '2026-10-06'
      }
    });

    assert.equal(resultado.solicitacaoId, 'sol-uuid-123');
    assert.equal(resultado.aguardandoCpf, true);
    assert.equal(resultado.aguardandoDataConsulta, true);
    assert.equal(resultado.mensagemCpfEnviada, true);

    // Valida que a mensagem não cita IA nem robô e fala humanizadamente
    assert.match(textoEnviado, /Olá, Maria!/);
    assert.match(textoEnviado, /confirmar seu CPF/i);
    assert.doesNotMatch(textoEnviado, /\bia\b|rob[oô]|assistente virtual|intelig[eê]ncia/i);

    // Valida que marcou whatsapp_conversas como aguardando_cpf_desde
    assert.ok(queries.some(q => q.includes('aguardando_cpf_desde')));
  });
});
