import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  correlacionarConsultaPagamento,
  type MensagemContextoConversa
} from './correlacionar-consulta-pagamento.js';

describe('correlacionarConsultaPagamento', () => {
  test('deve correlacionar agendamento prévio com comprovante visual recebido do paciente', () => {
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
        conteudo: 'pode ser às 10h? vou pagar no pix',
        criadoEm: '2026-10-09T22:07:00.000Z'
      },
      {
        id: 'msg-3',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        payloadBruto: {
          comprovante: {
            ehComprovante: true,
            valorCentavos: 160000,
            tipo: 'pix'
          }
        },
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

  test('NUNCA gera candidato quando clínica ou secretária apenas envia valores em mensagem de texto', () => {
    const mensagens: MensagemContextoConversa[] = [
      {
        id: 'msg-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Olá, Carlos! O valor da consulta com a Dra. Bruna é R$ 400,00.',
        criadoEm: '2026-10-07T10:00:00.000Z'
      },
      {
        id: 'msg-2',
        direcao: 'recebida',
        tipo: 'texto',
        conteudo: 'Perfeito, vou verificar o melhor horário.',
        criadoEm: '2026-10-07T10:30:00.000Z'
      }
    ];

    const candidatos = correlacionarConsultaPagamento(mensagens, '51981936133');
    assert.equal(candidatos.length, 0, 'Mensagem de texto com valores nunca deve gerar candidato a emissão');
  });

  test('NUNCA gera candidato quando paciente envia foto de exame ou receita (ehComprovante: false)', () => {
    const mensagens: MensagemContextoConversa[] = [
      {
        id: 'msg-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Olá Carlos, sua consulta está agendada para 13/10/2026 às 14h. Valor: R$ 400,00.',
        criadoEm: '2026-10-10T10:00:00.000Z'
      },
      {
        id: 'msg-2',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        payloadBruto: {
          comprovante: {
            ehComprovante: false
          }
        },
        criadoEm: '2026-10-10T11:00:00.000Z'
      }
    ];

    const candidatos = correlacionarConsultaPagamento(mensagens, '51981936133');
    assert.equal(candidatos.length, 0, 'Foto de exame ou documento não-comprovante deve ser descartada');
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
        tipo: 'imagem',
        conteudo: '',
        payloadBruto: {
          comprovante: {
            ehComprovante: true,
            valorCentavos: 25000,
            tipo: 'pix'
          }
        },
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

  test('deve correlacionar comprovante bancário legível sem valor mas com valor citado previamente no chat', () => {
    const mensagens: MensagemContextoConversa[] = [
      {
        id: 'msg-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Olá Bruno! Sua consulta foi agendada para 13/10/2026 às 14h. Valor: 400,00. Chave Pix: 123456',
        criadoEm: '2026-10-13T10:00:00.000Z'
      },
      {
        id: 'msg-2',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        payloadBruto: {
          comprovante: {
            ehComprovante: true,
            tipo: 'pix'
          }
        },
        criadoEm: '2026-10-13T11:00:00.000Z'
      }
    ];

    const candidatos = correlacionarConsultaPagamento(
      mensagens,
      '555196854299',
      'Bruno Z',
      new Date('2026-10-13T12:00:00.000Z'),
      70000
    );

    assert.equal(candidatos.length, 1);
    assert.equal(candidatos[0].pacienteNome, 'Bruno Z');
    assert.equal(candidatos[0].valorCentavos, 40000);
    assert.equal(candidatos[0].valorFormatado, '400,00');
    assert.equal(candidatos[0].dataConsulta, '13/10/2026');
  });

  test('deve usar o valor padrão do serviço fiscal quando a imagem é comprovante válido e o chat não cita valor', () => {
    const mensagens: MensagemContextoConversa[] = [
      {
        id: 'msg-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Olá Eduarda! Consulta confirmada para 13/10/2026. Segue nossa chave Pix.',
        criadoEm: '2026-10-13T09:00:00.000Z'
      },
      {
        id: 'msg-2',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        payloadBruto: {
          comprovante: {
            ehComprovante: true,
            tipo: 'pix'
          }
        },
        criadoEm: '2026-10-13T10:30:00.000Z'
      }
    ];

    const candidatos = correlacionarConsultaPagamento(
      mensagens,
      '5551988887777',
      'Eduarda',
      new Date('2026-10-13T12:00:00.000Z'),
      70000 // R$ 700,00 padrão do médico
    );

    assert.equal(candidatos.length, 1);
    assert.equal(candidatos[0].pacienteNome, 'Eduarda');
    assert.equal(candidatos[0].valorCentavos, 70000);
    assert.equal(candidatos[0].valorFormatado, '700,00');
    assert.equal(candidatos[0].dataConsulta, '13/10/2026');
  });

  test('nunca extrai cumprimentos como Tudo Bem ou podemos confirmar e limpa tags de prontuário', () => {
    const mensagens: MensagemContextoConversa[] = [
      {
        id: 'msg-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Olá, Tudo bem?\nEstamos confirmando sua consulta para 16/09 às 14h.',
        criadoEm: '2026-09-10T10:00:00.000Z'
      },
      {
        id: 'msg-2',
        direcao: 'recebida',
        tipo: 'texto',
        conteudo: 'Olá! Eu tinha anotado que a consulta seria na quinta dia 27. Mas podemos confirmar na quarta 16/09.',
        criadoEm: '2026-09-10T11:00:00.000Z'
      },
      {
        id: 'msg-3',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Bom dia Elisa, tudo bem? Segue chave pix.',
        criadoEm: '2026-09-15T09:00:00.000Z'
      },
      {
        id: 'msg-4',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        payloadBruto: {
          comprovante: {
            ehComprovante: true,
            valorCentavos: 40000,
            tipo: 'pix'
          }
        },
        criadoEm: '2026-09-16T15:00:00.000Z'
      }
    ];

    // Sem nome cadastrado: deve extrair "Elisa" e nunca "Tudo bem" ou "podemos confirmar"
    const c1 = correlacionarConsultaPagamento(mensagens, '555192927022');
    assert.equal(c1.length, 1);
    assert.equal(c1[0].pacienteNome, 'Elisa');

    // Com nome de contato com tag clínica "PCT Roberta": deve limpar para "Elisa Ferreira"
    const c2 = correlacionarConsultaPagamento(mensagens, '555192927022', 'Elisa Ferreira PCT Roberta');
    assert.equal(c2.length, 1);
    assert.equal(c2[0].pacienteNome, 'Elisa Ferreira');
  });

  test('deve descartar comprovante que já teve nota fiscal enviada logo após', () => {
    const mensagens: MensagemContextoConversa[] = [
      {
        id: 'msg-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Olá Marcelo! Sua consulta está agendada para 11/11/2025 às 17h30. Valor: 320,00',
        criadoEm: '2025-11-10T17:35:00.000Z'
      },
      {
        id: 'msg-2',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        payloadBruto: {
          comprovante: {
            ehComprovante: true,
            valorCentavos: 32000,
            tipo: 'pix'
          }
        },
        criadoEm: '2025-11-11T20:20:00.000Z'
      },
      {
        id: 'msg-3',
        direcao: 'enviada',
        tipo: 'documento',
        conteudo: '',
        payloadBruto: {
          message: {
            documentMessage: {
              fileName: '43149022228297130000157000000000046725117598932162.pdf',
              title: '43149022228297130000157000000000046725117598932162.pdf'
            }
          }
        },
        criadoEm: '2025-11-11T20:23:30.000Z'
      },
      {
        id: 'msg-4',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Sua nota fiscal',
        criadoEm: '2025-11-11T20:23:36.000Z'
      }
    ];

    const candidatos = correlacionarConsultaPagamento(mensagens, '555181005225', 'Marcelo Simões');
    assert.equal(candidatos.length, 0, 'Comprovante seguido de nota fiscal enviada deve ser descartado');
  });

  test('deve eleger apenas o comprovante recente sem nota quando histórico tem pagamentos faturados no passado', () => {
    const mensagens: MensagemContextoConversa[] = [
      // 1. Pagamento antigo já faturado
      {
        id: 'msg-old-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Consulta confirmada dia 20/08 às 10h. Valor: 320,00',
        criadoEm: '2026-08-19T17:35:00.000Z'
      },
      {
        id: 'msg-old-2',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        payloadBruto: {
          comprovante: {
            ehComprovante: true,
            valorCentavos: 32000,
            tipo: 'pix'
          }
        },
        criadoEm: '2026-08-20T10:31:00.000Z'
      },
      {
        id: 'msg-old-3',
        direcao: 'enviada',
        tipo: 'documento',
        conteudo: 'Bom dia, segue sua nota',
        payloadBruto: {
          message: {
            documentMessage: {
              fileName: '43149022228297130000157000000000078226089957487047.pdf'
            }
          }
        },
        criadoEm: '2026-08-21T10:54:00.000Z'
      },
      // 2. Pagamento novo NÃO faturado
      {
        id: 'msg-new-1',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Olá Marcelo! Estamos confirmando sua consulta de hoje 13/10 às 17h30.',
        criadoEm: '2026-10-13T09:33:00.000Z'
      },
      {
        id: 'msg-new-2',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        payloadBruto: {
          comprovante: {
            ehComprovante: true,
            valorCentavos: 32000,
            tipo: 'pix'
          }
        },
        criadoEm: '2026-10-13T20:30:59.000Z'
      }
    ];

    const candidatos = correlacionarConsultaPagamento(
      mensagens,
      '555181005225',
      'Marcelo Simões PCT Roberta',
      new Date('2026-10-14T00:00:00.000Z'),
      32000
    );

    assert.equal(candidatos.length, 1);
    assert.equal(candidatos[0].pacienteNome, 'Marcelo Simões');
    assert.equal(candidatos[0].dataConsulta, '13/10/2026');
    assert.equal(candidatos[0].origemEvidencia.mensagemPagamentoId, 'msg-new-2');
  });

  test('deve respeitar dataCortePagamento para descartar pagamentos antigos mas manter contexto conversacional profundo', () => {
    const mensagens: MensagemContextoConversa[] = [
      {
        id: 'msg-antiga-nome',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Olá Luciana, tudo bem? Marcamos sua consulta para 10/10.',
        criadoEm: '2026-07-01T10:00:00.000Z' // 3 meses atrás
      },
      {
        id: 'msg-pagamento-antigo',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        payloadBruto: {
          comprovante: {
            ehComprovante: true,
            valorCentavos: 50000,
            tipo: 'pix'
          }
        },
        criadoEm: '2026-07-02T10:00:00.000Z' // Pagamento antigo
      },
      {
        id: 'msg-consulta-recente',
        direcao: 'enviada',
        tipo: 'texto',
        conteudo: 'Confirmando seu retorno hoje dia 13/10.',
        criadoEm: '2026-10-13T09:00:00.000Z'
      },
      {
        id: 'msg-pagamento-recente',
        direcao: 'recebida',
        tipo: 'imagem',
        conteudo: '',
        payloadBruto: {
          comprovante: {
            ehComprovante: true,
            valorCentavos: 50000,
            tipo: 'pix'
          }
        },
        criadoEm: '2026-10-13T10:00:00.000Z'
      }
    ];

    // Corte em 01/10/2026 (últimos 15 dias)
    const dataCorte = new Date('2026-10-01T00:00:00.000Z');
    const candidatos = correlacionarConsultaPagamento(
      mensagens,
      '5551999998888',
      undefined,
      new Date('2026-10-13T12:00:00.000Z'),
      undefined,
      dataCorte
    );

    // Deve eleger APENAS o pagamento recente (msg-pagamento-recente), mas recuperar o nome "Luciana" do contexto de 3 meses atrás!
    assert.equal(candidatos.length, 1);
    assert.equal(candidatos[0].pacienteNome, 'Luciana');
    assert.equal(candidatos[0].origemEvidencia.mensagemPagamentoId, 'msg-pagamento-recente');
    assert.equal(candidatos[0].dataConsulta, '13/10/2026');
  });
});
