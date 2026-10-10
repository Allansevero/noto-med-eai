/**
 * Testes unitários para FerramentasAssistenteNoto.
 * Valida interpretação de linguagem natural para janela temporal,
 * solicitação de CPF ao paciente (sem se identificar como IA),
 * consulta de resumo de pacientes e processamento de comprovantes com PaliGemma.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FerramentasAssistenteNoto } from './ferramentas-assistente-noto.js';

describe('FerramentasAssistenteNoto', () => {
  function instanciarFerramentas(overrides: {
    buscarMedicoOnline?: any;
    paligemma?: any;
    enviador?: any;
    pool?: any;
  } = {}) {
    const poolMock = overrides.pool || {
      query: async (sql: string, args?: any[]) => {
        if (sql.includes('count(*)::integer as total from pacientes')) {
          return { rows: [{ total: 12 }] };
        }
        if (sql.includes('join solicitacoes_nota s on s.id = n.solicitacao_id')) {
          return { rows: [{ total: 45 }] };
        }
        if (sql.includes("status = 'pendente'")) {
          return { rows: [{ total: 3 }] };
        }
        if (sql.includes('insert into auditoria')) {
          return { rows: [] };
        }
        return { rows: [] };
      },
      connect: async () => ({
        query: async () => ({ rows: [{ usuario_id: 'usr-1' }] }),
        release: () => {}
      })
    };

    const buscarOnlineMock = overrides.buscarMedicoOnline || {
      buscarPorNome: async (nome: string) => ({
        nome,
        crm: '123456',
        rqe: '7890',
        especialidade: 'Cardiologia',
        uf: 'SP'
      })
    };

    const paligemmaMock = overrides.paligemma || {
      analisarImagem: async () => ({
        ehComprovante: true,
        valorCentavos: 30000,
        dataPagamento: '2026-10-01'
      })
    };

    const enviadorMock = overrides.enviador || {
      enviarTexto: async () => ({ sucesso: true })
    };

    return new FerramentasAssistenteNoto(
      poolMock as any,
      buscarOnlineMock,
      paligemmaMock,
      enviadorMock
    );
  }

  describe('interpretarJanelaTempo', () => {
    it('deve interpretar meses corretamente', () => {
      const ferramentas = instanciarFerramentas();
      const agora = new Date('2026-10-08T12:00:00Z');

      const data2Meses = ferramentas.interpretarJanelaTempo('faz uns 2 meses que não emito', agora);
      assert.equal(data2Meses, '2026-08-08');

      const data3Meses = ferramentas.interpretarJanelaTempo('3 meses', agora);
      assert.equal(data3Meses, '2026-07-08');
    });

    it('deve interpretar semanas corretamente', () => {
      const ferramentas = instanciarFerramentas();
      const agora = new Date('2026-10-08T12:00:00Z');

      const data2Semanas = ferramentas.interpretarJanelaTempo('2 semanas atrás', agora);
      assert.equal(data2Semanas, '2026-09-24');
    });

    it('deve interpretar menção a meses nominais como janeiro', () => {
      const ferramentas = instanciarFerramentas();
      const agora = new Date('2026-10-08T12:00:00Z');

      const dataJaneiro = ferramentas.interpretarJanelaTempo('desde janeiro não emito nada', agora);
      assert.equal(dataJaneiro, '2026-01-01');
    });
  });

  describe('pedirCpfPaciente', () => {
    it('deve enviar mensagem humanizada sem revelar que é IA', async () => {
      let textoCapturado = '';
      const ferramentas = instanciarFerramentas({
        enviador: {
          enviarTexto: async (p: any) => {
            textoCapturado = p.texto;
            return { sucesso: true };
          }
        }
      });

      const res = await ferramentas.pedirCpfPaciente({
        instanciaNome: 'clinica-dr-silva',
        pacienteTelefone: '5511999991111',
        pacienteNome: 'Mariana Costa'
      });

      assert.equal(res.sucesso, true);
      assert.match(textoCapturado, /Olá, Mariana!/);
      assert.match(textoCapturado, /confirmar seu CPF/i);
      // NUNCA pode parecer ou informar que é IA/robô
      assert.doesNotMatch(textoCapturado, /\bia\b|rob[oô]|assistente virtual|intelig[eê]ncia/i);
    });
  });

  describe('obterResumoPacientes', () => {
    it('deve retornar contagens consolidadas', async () => {
      const ferramentas = instanciarFerramentas();
      const resumo = await ferramentas.obterResumoPacientes('med-1');

      assert.equal(resumo.totalPacientesCadastrados, 12);
      assert.equal(resumo.totalNotasEmitidas, 45);
      assert.equal(resumo.totalNotasPendentes, 3);
    });
  });

  describe('processarConversaParaComprovantes', () => {
    it('deve chamar PaliGemma e filtrar comprovantes sem nota', async () => {
      let chamouPaliGemma = false;
      const ferramentas = instanciarFerramentas({
        paligemma: {
          analisarImagem: async () => {
            chamouPaliGemma = true;
            return {
              ehComprovante: true,
              valorCentavos: 50000,
              dataPagamento: '2026-10-05'
            };
          }
        }
      });

      const mensagens = [
        {
          id: 'msg-img-1',
          data: '2026-10-05T14:00:00Z',
          tipo: 'imagem' as const,
          imagemBase64: 'base64-dados-fake'
        }
      ];

      const comprovantes = await ferramentas.processarConversaParaComprovantes(mensagens as any);

      assert.equal(chamouPaliGemma, true);
      assert.equal(comprovantes.length, 1);
      assert.equal(comprovantes[0].valorCentavos, 50000);
    });
  });
});
