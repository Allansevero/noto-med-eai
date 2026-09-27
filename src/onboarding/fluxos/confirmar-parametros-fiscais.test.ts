import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { confirmarParametrosFiscais } from './confirmar-parametros-fiscais.js';

describe('confirmarParametrosFiscais', () => {
  it('deve executar updates com parâmetros fornecidos', async () => {
    const executedQueries: Array<{ sql: string; values: any[] }> = [];
    const mockPool = {
      query: async (sql: string, values: any[]) => {
        executedQueries.push({ sql, values });
        return { rows: [] };
      }
    } as any;

    await confirmarParametrosFiscais(mockPool, {
      medicoId: 'medico-123',
      razaoSocial: 'Dra. Martina Becker',
      especialidade: 'Psiquiatria',
      aliquotaIss: 3.0,
      serieDps: '00001',
      proximoNumeroDps: 216
    });

    assert.equal(executedQueries.length, 3);
    assert.ok(executedQueries[0].sql.includes('confirmado_pelo_medico = true'));
    assert.ok(executedQueries[1].sql.includes('aliquota_iss = $2'));
    assert.ok(executedQueries[2].sql.includes('especialidade = coalesce'));
  });
});
