import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criarEnviadorConversasNoto } from './enviador-conversas-noto.js';
test('oficial não envia conversa; assistente e pacientes usam respectivos containers', async () => {
  const envios: string[] = [];
  const e = criarEnviadorConversasNoto({
    oficialNome: 'oficial',
    assistenteNome: 'assistente',
    assistente: {
      enviarTexto: async (p) => {
        envios.push('assistente:' + p.instanciaNome);
        return { sucesso: true };
      }
    },
    clinicas: {
      enviarTexto: async (p) => {
        envios.push('clinica:' + p.instanciaNome);
        return { sucesso: true };
      }
    }
  });
  const p = { contatoTelefone: '5511999991234', texto: 'teste' };
  assert.equal(
    (await e.enviarTexto({ ...p, instanciaNome: 'oficial' })).sucesso,
    false
  );
  await e.enviarTexto({ ...p, instanciaNome: 'assistente' });
  await e.enviarTexto({ ...p, instanciaNome: 'medico_123' });
  assert.deepEqual(envios, ['assistente:assistente', 'clinica:medico_123']);
});
