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
    assert.ok(!executedQueries[2].sql.includes('nome_completo'));
    assert.deepEqual(executedQueries[2].values, ['medico-123', 'Psiquiatria']);
  });
  it('alterar razão social não substitui a identidade profissional salva na conta', async () => {
    const queries: string[] = [];
    await confirmarParametrosFiscais({ query: async (sql: string) => {
      queries.push(sql); return { rows: [] };
    } } as any, { medicoId: 'm', razaoSocial: 'Clínica Exemplo Ltda' });
    assert.equal(queries.length, 1);
    assert.ok(queries[0].includes('razao_social'));
    assert.ok(!queries.some(sql => sql.includes('update medicos')));
  });
});
