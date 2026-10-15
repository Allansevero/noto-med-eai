import test from 'node:test';
import assert from 'node:assert';
import { ConversaFontePacientes } from './conversa-fonte-pacientes.js';

test('ConversaFontePacientes: busca contato por telefone e busca dados de comprovante', async () => {
  const mockPool = {
    query: async (sql: string) => {
      if (sql.includes('from whatsapp_conversas')) {
        return {
          rows: [
            {
              conversa_id: 'conv-1',
              contato_nome: 'Antônio Marques',
              contato_telefone: '51998124521',
              paciente_id: null,
              cpf_limpo: null
            }
          ]
        };
      }
      if (sql.includes('from candidatos_emissao')) {
        return {
          rows: [
            {
              valor_centavos: 35000,
              data_pagamento: new Date('2026-10-10T12:00:00Z')
            }
          ]
        };
      }
      return { rows: [] };
    }
  } as any;

  const fonte = new ConversaFontePacientes(mockPool);
  const res = await fonte.buscar('medico-1', { telefone: '51998124521' });

  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].nome, 'Antônio Marques');
  assert.strictEqual(res[0].valorSugeridoCentavos, 35000);
  assert.strictEqual(res[0].dataConsultaSugerida, '2026-10-10');
  assert.strictEqual(res[0].origem, 'conversa');
});
