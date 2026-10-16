/**
 * Testes unitários para extração pura de data e contexto de consulta em /ia.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extrairContextoConsultaConversa } from './extrair-contexto-consulta-conversa.js';
import type { MensagemEntradaIa } from '../../../contratos/tipos-ia.js';

describe('Extração de Contexto de Consulta em /ia', () => {
  it('deve extrair data de consulta informada na descrição do PIX com prioridade', () => {
    const mensagens: MensagemEntradaIa[] = [
      { id: '1', direcao: 'recebida', tipo: 'texto', conteudo: 'Segue o comprovante', timestamp: '2026-10-15T10:00:00.000Z' }
    ];

    const res = extrairContextoConsultaConversa(mensagens, 'Maria Silva', '12/10/2026');

    assert.equal(res.dataConsultaFormatada, '12/10/2026');
    assert.equal(res.dataConsultaIso, '2026-10-12');
    assert.equal(res.nomePaciente, 'Maria Silva');
  });

  it('deve extrair data de agendamento em mensagem de confirmação anterior', () => {
    const mensagens: MensagemEntradaIa[] = [
      { id: '1', direcao: 'enviada', tipo: 'texto', conteudo: 'Oi Mariana, sua consulta ficou agendada para 14/10 às 15h.', timestamp: '2026-10-10T10:00:00.000Z' },
      { id: '2', direcao: 'recebida', tipo: 'texto', conteudo: 'Perfeito, estarei lá!', timestamp: '2026-10-10T10:05:00.000Z' },
      { id: '3', direcao: 'recebida', tipo: 'texto', conteudo: 'Dra, segue o pagamento do pix', timestamp: '2026-10-15T12:00:00.000Z' }
    ];

    const res = extrairContextoConsultaConversa(mensagens, null);

    assert.equal(res.nomePaciente, 'Mariana');
    assert.equal(res.dataConsultaFormatada, '14/10/2026');
    assert.equal(res.dataConsultaIso, '2026-10-14');
  });
});
