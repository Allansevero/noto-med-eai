import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { conectarInstanciaWhatsappMedico } from './conectar-instancia-whatsapp-medico.js';

describe('conectarInstanciaWhatsappMedico', () => {
  it('deve gerar nome de instância seguro e salvar no banco', async () => {
    const executedQueries: any[] = [];
    const mockPool = {
      query: async (sql: string, values: any[]) => {
        executedQueries.push({ sql, values });
        return { rows: [{ id: 'inst-123' }] };
      }
    } as any;

    const res = await conectarInstanciaWhatsappMedico(mockPool, {
      medicoId: 'e20790d9-b541-4712-a7d0-7e3fbe3f64c6',
      evolutionUrl: 'http://localhost:8080',
      evolutionApiKey: 'teste-key',
      appWebhookUrl: 'http://localhost:3000',
      webhookSecret: 'secret-123'
    });

    assert.equal(res.ok, true);
    assert.ok(res.nomeInstancia.startsWith('medico_'));
    assert.equal(executedQueries.length, 1);
    assert.ok(executedQueries[0].sql.includes('whatsapp_instancias'));
  });
});
