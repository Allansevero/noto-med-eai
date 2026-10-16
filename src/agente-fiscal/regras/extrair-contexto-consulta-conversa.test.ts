/**
 * Testes unitários puros da regra de extração de contexto de consulta.
 * Valida precedência de comprovante, confirmação na conversa e ausência de data.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extrairContextoConsultaConversa } from './extrair-contexto-consulta-conversa.js';
import type { MensagemContextoConversa } from './correlacionar-consulta-pagamento.js';

describe('extrairContextoConsultaConversa', () => {
  const agora = new Date('2026-10-15T14:00:00Z');
  const msgPagamento: MensagemContextoConversa = {
    id: 'msg-pag-1',
    direcao: 'recebida',
    tipo: 'imagem',
    criadoEm: new Date('2026-10-15T12:00:00Z')
  };

  it('deve priorizar a data descrita no próprio comprovante de pagamento', () => {
    const msgs: MensagemContextoConversa[] = [
      {
        id: 'msg-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Olá Carlos, tudo bem? Consulta agendada para 10/10/2026',
        criadoEm: new Date('2026-10-08T10:00:00Z')
      }
    ];

    const res = extrairContextoConsultaConversa(
      msgs,
      msgPagamento,
      null,
      agora,
      '14/10/2026'
    );

    assert.equal(res.dataConsultaFormatada, '14/10/2026');
    assert.equal(res.dataConsultaIso, '2026-10-14');
    assert.equal(res.nomePaciente, 'Carlos');
  });

  it('deve extrair a data agendada nas mensagens anteriores se não houver no comprovante', () => {
    const msgs: MensagemContextoConversa[] = [
      {
        id: 'msg-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Bom dia Juliana! Sua consulta está marcada para dia 13/10 às 15h.',
        criadoEm: new Date('2026-10-10T09:00:00Z')
      }
    ];

    const res = extrairContextoConsultaConversa(
      msgs,
      msgPagamento,
      null,
      agora
    );

    assert.equal(res.dataConsultaFormatada, '13/10/2026');
    assert.equal(res.dataConsultaIso, '2026-10-13');
    assert.equal(res.nomePaciente, 'Juliana');
    assert.equal(res.mensagemId, 'msg-1');
  });

  it('deve deixar data pendente quando nem o comprovante nem a conversa citarem data', () => {
    const msgs: MensagemContextoConversa[] = [
      {
        id: 'msg-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Boa tarde! Tudo bem? Segue a chave PIX.',
        criadoEm: new Date('2026-10-15T11:00:00Z')
      }
    ];

    const res = extrairContextoConsultaConversa(
      msgs,
      msgPagamento,
      'Renata Silva',
      agora
    );

    assert.equal(res.dataConsultaFormatada, '');
    assert.equal(res.dataConsultaIso, '');
    assert.equal(res.nomePaciente, 'Renata Silva');
  });
});
