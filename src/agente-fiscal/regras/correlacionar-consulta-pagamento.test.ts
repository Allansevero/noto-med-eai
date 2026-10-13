import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  correlacionarConsultaPagamento,
  type MensagemContextoConversa
} from './correlacionar-consulta-pagamento.js';

describe('correlacionarConsultaPagamento', () => {
  test('deve correlacionar agendamento prévio com pagamento por link posterior', () => {
    const mensagens: MensagemContextoConversa[] = [
      {
        id: 'msg-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Olá, *Janayna*!\nEste é um lembrete do seu procedimento agendado para, *13/10/2026*, às *10:30* hrs.',
        criadoEm: '2026-10-09T18:58:37.000Z'
      },
      {
        id: 'msg-2',
        direcao: 'recebida',
        tipo: 'texto',
        conteudo: 'pode ser às 10h? vou pagar no cartão',
        criadoEm: '2026-10-09T22:07:00.000Z'
      },
      {
        id: 'msg-3',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'https://link.infinitepay.io/clinica-recanto/VC1D-7FBXC2NecE-1600,00',
        criadoEm: '2026-10-10T15:52:05.000Z'
      }
    ];

    const candidatos = correlacionarConsultaPagamento(mensagens, '554888567744');
    assert.equal(candidatos.length, 1);
    const c = candidatos[0];
    assert.equal(c.pacienteNome, 'Janayna');
    assert.equal(c.pacienteTelefone, '4888567744');
    assert.equal(c.valorCentavos, 160000);
    assert.equal(c.valorFormatado, '1600,00');
    assert.equal(c.dataConsulta, '13/10/2026');
    assert.equal(c.dataConsultaIso, '2026-10-13');
  });

  test('deve correlacionar Pix enviado em texto com consulta do dia anterior', () => {
    const mensagens: MensagemContextoConversa[] = [
      {
        id: 'msg-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Olá, Carlos! Sua consulta está confirmada para o dia 08/10/2026.',
        criadoEm: '2026-10-07T10:00:00.000Z'
      },
      {
        id: 'msg-2',
        direcao: 'recebida',
        tipo: 'texto',
        conteudo: 'Segue o comprovante do Pix no valor de R$ 350,00',
        criadoEm: '2026-10-08T15:30:00.000Z'
      }
    ];

    const candidatos = correlacionarConsultaPagamento(mensagens, '51981936133');
    assert.equal(candidatos.length, 1);
    const c = candidatos[0];
    assert.equal(c.pacienteNome, 'Carlos');
    assert.equal(c.valorCentavos, 35000);
    assert.equal(c.valorFormatado, '350,00');
    assert.equal(c.dataConsulta, '08/10/2026');
  });

  test('deve usar o nome do cadastro do paciente caso não haja saudação no chat', () => {
    const mensagens: MensagemContextoConversa[] = [
      {
        id: 'msg-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Consulta agendada para 14/10/2026.',
        criadoEm: '2026-10-12T10:00:00.000Z'
      },
      {
        id: 'msg-2',
        direcao: 'recebida',
        tipo: 'texto',
        conteudo: 'Pago via Pix R$ 250,00',
        criadoEm: '2026-10-13T09:00:00.000Z'
      }
    ];

    const candidatos = correlacionarConsultaPagamento(
      mensagens,
      '51999998888',
      'Mariana Albuquerque'
    );
    assert.equal(candidatos.length, 1);
    assert.equal(candidatos[0].pacienteNome, 'Mariana Albuquerque');
    assert.equal(candidatos[0].dataConsulta, '14/10/2026');
  });
});
