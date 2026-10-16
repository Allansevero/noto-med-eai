import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferirDataConsultaHistorico } from './inferir-data-consulta-historico.js';

describe('inferirDataConsultaHistorico', () => {
  it('deve resolver "amanhã" relativo à data em que a mensagem de agendamento foi enviada (e não à data de hoje)', () => {
    const res = inferirDataConsultaHistorico({
      mensagensAnteriores: [
        {
          id: 'm1',
          direcao: 'enviada',
          tipo: 'texto',
          conteudo: 'Olá Marina! Confirmando sua consulta de amanhã às 14h.',
          criadoEm: '2026-10-08T14:00:00.000Z'
        }
      ],
      msgPagamento: {
        id: 'm2',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        criadoEm: '2026-10-12T10:00:00.000Z'
      }
    });

    assert.equal(res.dataConsultaFormatada, '09/10/2026');
    assert.equal(res.dataConsultaIso, '2026-10-09');
    assert.equal(res.confianca, 'alta');
    assert.equal(res.ambiguo, false);
  });

  it('deve resolver negociação em duas mensagens quando secretária oferece 2 datas e paciente escolhe "dia 16"', () => {
    const res = inferirDataConsultaHistorico({
      mensagensAnteriores: [
        {
          id: 'm1',
          direcao: 'enviada',
          tipo: 'texto',
          conteudo: 'Temos horário disponível dia 14/10 ou 16/10 às 15h.',
          criadoEm: '2026-10-10T10:00:00.000Z'
        },
        {
          id: 'm2',
          direcao: 'recebida',
          tipo: 'texto',
          conteudo: 'Pode ser dia 16 por favor!',
          criadoEm: '2026-10-10T10:05:00.000Z'
        }
      ],
      msgPagamento: {
        id: 'm3',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        criadoEm: '2026-10-16T18:00:00.000Z'
      }
    });

    assert.equal(res.dataConsultaFormatada, '16/10/2026');
    assert.equal(res.dataConsultaIso, '2026-10-16');
    assert.equal(res.confianca, 'alta');
    assert.equal(res.ambiguo, false);
  });

  it('deve priorizar data informada na legenda do comprovante ou mensagem imediata do paciente', () => {
    const res = inferirDataConsultaHistorico({
      mensagensAnteriores: [
        {
          id: 'm1',
          direcao: 'enviada',
          tipo: 'texto',
          conteudo: 'Consulta agendada para 10/10/2026.',
          criadoEm: '2026-10-09T10:00:00.000Z'
        }
      ],
      msgPagamento: {
        id: 'm2',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        criadoEm: '2026-10-14T15:00:00.000Z'
      },
      mensagensPosteriores: [
        {
          id: 'm3',
          direcao: 'recebida',
          tipo: 'texto',
          conteudo: 'Segue comprovante referente à consulta de ontem 13/10',
          criadoEm: '2026-10-14T15:01:00.000Z'
        }
      ]
    });

    assert.equal(res.dataConsultaFormatada, '13/10/2026');
    assert.equal(res.dataConsultaIso, '2026-10-13');
    assert.equal(res.confianca, 'alta');
  });

  it('deve ignorar datas de consultas antigas fora da janela plausível (> 90 dias antes do pagamento)', () => {
    const res = inferirDataConsultaHistorico({
      mensagensAnteriores: [
        {
          id: 'm-antiga',
          direcao: 'enviada',
          tipo: 'texto',
          conteudo: 'Consulta agendada para 10/03/2026.',
          criadoEm: '2026-03-09T10:00:00.000Z'
        }
      ],
      msgPagamento: {
        id: 'm-pag',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        criadoEm: '2026-10-14T15:00:00.000Z'
      }
    });

    assert.equal(res.dataConsultaFormatada, '14/10/2026');
    assert.equal(res.confianca, 'baixa');
    assert.equal(res.ambiguo, true);
  });
});
