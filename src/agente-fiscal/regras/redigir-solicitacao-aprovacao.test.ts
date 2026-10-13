import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { redigirSolicitacaoAprovacao } from './redigir-solicitacao-aprovacao.js';

describe('redigirSolicitacaoAprovacao', () => {
  test('deve redigir mensagem fluida e humanizada sem títulos robóticos', () => {
    const texto = redigirSolicitacaoAprovacao({
      nomeMedico: 'Bruna Botter',
      candidato: {
        pacienteNome: 'Janayna Silva',
        pacienteTelefone: '48988856774',
        valorCentavos: 160000,
        valorFormatado: '1600,00',
        dataConsulta: '13/10/2026',
        dataConsultaIso: '2026-10-13',
        origemEvidencia: {
          mensagemPagamentoId: 'm-1',
          trechoPagamento: 'link'
        }
      }
    });

    assert.match(texto, /Oi, Dr\(a\)\. Bruna!/);
    assert.match(texto, /Janayna Silva/);
    assert.match(texto, /\(48\) 98885-6774/);
    assert.match(texto, /R\$ 1600,00/);
    assert.match(texto, /13\/10\/2026/);
    assert.match(texto, /Posso emitir a nota fiscal dela\?/);
    assert.equal(texto.includes('AVISO:'), false);
    assert.equal(texto.includes('Paciente:'), false);
  });
});
