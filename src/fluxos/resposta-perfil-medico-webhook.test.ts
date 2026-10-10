import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processarMensagemWebhook } from './processar-mensagem-webhook.js';

test('resposta ao cadastro só é coletada de entrada pelo Noto Assistente e antes de cadastrar um paciente', async () => {
  for (const [instancia, fromMe, reconhecido, esperado] of [
    ['noto_assistente', false, true, true], ['noto_oficial', true, true, false],
    ['medico_conectado', false, true, false], ['noto_oficial', false, false, false]
  ] as const) {
    const entradas: any[] = [];
    const repo = {
      buscarInstanciaPorNome: async () => ({ id: 'inst', medicoId: null, nomeInstancia: instancia, oficial: instancia === 'noto_oficial' }),
      buscarMedicoPorTelefone: async () => reconhecido ? { id: 'medico-do-remetente' } : null,
      buscarOuCriarConversa: async () => ({ id: 'conv', medicoId: null, pacienteId: null }),
      buscarSolicitacaoAguardandoData: async () => null,
      criarPacienteMinimo: async () => { throw new Error('Não criar paciente para resposta do médico'); }
    };
    const resultado = await processarMensagemWebhook({ event: 'messages.upsert', instance: instancia,
      data: { key: { id: 'mensagem-123', fromMe, remoteJid: '5548999998888@s.whatsapp.net' },
      message: { conversation: 'Nome completo: Maria da Silva\nCRM: 12345/SC' } } }, 'segredo', {
      repositorio: repo, segredoConfigurado: 'segredo', instanciaOficialNome: 'noto_oficial', instanciaAssistenteNome:'noto_assistente',
      dadosProfissionais: { processarResposta: async (entrada: any) => { entradas.push(entrada); return { tratada: true, completo: true }; } }
    } as any);
    assert.equal(entradas.length, esperado ? 1 : 0);
    if (esperado) {
      assert.equal(resultado.ok && resultado.acao, 'resposta_perfil_medico');
      assert.equal(entradas[0].medicoId, 'medico-do-remetente');
      assert.equal(entradas[0].mensagemId, 'mensagem-123');
    }
  }
});
