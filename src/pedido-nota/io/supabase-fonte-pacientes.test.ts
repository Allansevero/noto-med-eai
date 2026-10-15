import test from 'node:test';
import assert from 'node:assert';
import { SupabaseFontePacientes } from './supabase-fonte-pacientes.js';

test('SupabaseFontePacientes: retorna vazio quando nenhum critério é informado', async () => {
  const mockPool = {
    query: async () => ({ rows: [] })
  } as any;

  const fonte = new SupabaseFontePacientes(mockPool, 'pepper123');
  const res = await fonte.buscar('medico-1', {});
  assert.strictEqual(res.length, 0);
});

test('SupabaseFontePacientes: busca por nome e enriquece com último valor de nota', async () => {
  const mockPool = {
    query: async (sql: string, params: any[]) => {
      if (sql.includes('from pacientes')) {
        return {
          rows: [
            {
              id: 'pac-1',
              nome: 'Antônio Marques Silva',
              telefone: '51998124521',
              cpf_limpo: '52998224725'
            }
          ]
        };
      }
      if (sql.includes('from solicitacoes_nota')) {
        return {
          rows: [{ valor_servico_centavos: 40000 }]
        };
      }
      return { rows: [] };
    }
  } as any;

  const fonte = new SupabaseFontePacientes(mockPool, 'pepper123');
  const res = await fonte.buscar('medico-1', { nome: 'Antônio Marques' });

  assert.strictEqual(res.length, 1);
  assert.strictEqual(res[0].nome, 'Antônio Marques Silva');
  assert.strictEqual(res[0].cpfLimpo, '52998224725');
  assert.strictEqual(res[0].valorSugeridoCentavos, 40000);
  assert.strictEqual(res[0].origem, 'supabase');
});
