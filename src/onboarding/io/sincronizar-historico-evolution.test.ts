import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sincronizarHistoricoEvolution } from './sincronizar-historico-evolution.js';

describe('sincronizarHistoricoEvolution', () => {
  it('percorre as páginas salvas na Evolution e vincula o paciente', async () => {
    const conversas: any[] = [];
    const pacientes: any[] = [];
    const repositorio: any = {
      buscarInstanciaPorNome: async () => ({
        id: 'inst-1', medicoId: 'med-1', nomeInstancia: 'medico_123', oficial: false
      }),
      buscarOuCriarConversa: async (_instanciaId: string, medicoId: string, telefone: string) => {
        let conversa = conversas.find((item) => item.contatoTelefone === telefone);
        if (!conversa) {
          conversa = {
            id: 'conv-1', instanciaId: 'inst-1', medicoId, contatoTelefone: telefone,
            pacienteId: null, aguardandoCpfDesde: null
          };
          conversas.push(conversa);
        }
        return conversa;
      },
      buscarPacientePorTelefone: async (_medicoId: string, telefone: string) =>
        pacientes.find((item) => item.telefone === telefone) ?? null,
      criarPacienteMinimo: async (params: any) => {
        const existente = pacientes.find((item) => item.telefone === params.telefone);
        if (existente) return existente;
        const paciente = {
          id: 'pac-1', medicoId: params.medicoId, telefone: params.telefone,
          nome: params.nome, cpfHash: params.cpfHash
        };
        pacientes.push(paciente);
        return paciente;
      },
      atualizarCpfPaciente: async (params: any) => {
        const paciente = pacientes.find((item) => item.id === params.pacienteId);
        paciente.cpfHash = params.cpfHash;
      },
      vincularPacienteConversa: async (_conversaId: string, pacienteId: string) => {
        conversas[0].pacienteId = pacienteId;
      }
    };

    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      const pagina = JSON.parse(String(init?.body)).page;
      const registros = pagina === 1
        ? [{
            key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: '1' },
            pushName: 'Maria Silva',
            message: { conversation: 'Olá, preciso de uma consulta.' }
          }]
        : [{
            key: { remoteJid: '5511999998888@s.whatsapp.net', fromMe: false, id: '2' },
            message: { conversation: 'Meu CPF é 529.982.247-25.' }
          }];
      return new Response(JSON.stringify({
        messages: { pages: 2, currentPage: pagina, records: registros }
      }));
    };

    try {
      const resultado = await sincronizarHistoricoEvolution({
        baseUrl: 'https://evolution.test',
        apiKey: 'chave',
        nomeInstancia: 'medico_123',
        repositorio,
        pepper: 'pepper'
      });

      assert.equal(resultado.mensagensAnalisadas, 2);
      assert.equal(resultado.conversasAnalisadas, 1);
      assert.equal(resultado.pacientesVinculados, 1);
      assert.equal(pacientes[0].nome, 'Maria Silva');
      assert.ok(pacientes[0].cpfHash);
      assert.equal(conversas[0].pacienteId, pacientes[0].id);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });
});
