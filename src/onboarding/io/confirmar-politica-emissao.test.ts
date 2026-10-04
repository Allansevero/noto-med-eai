/** Confirmação deve ser atômica e invalidar ambiguidades, sem aprovação por defaults. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmarPoliticaEmissao } from './confirmar-politica-emissao.js';
const parametros = { ambiente: 'homologacao', vigenciaInicio: '2026-10-01', municipioPrestacao: '3550308', opcaoSimplesNacional: 'me_epp',
  regimeApuracaoSn: 'regime_1', regimeEspecialTributacao: 0, tribISSQN: 1, tpRetISSQN: 1, cstPisCofins: '06', percentualTotTribSN: 0 };
function montar(falhar = false, quantidade = 1) {
  const queries: Array<{ sql: string; params?: any[] }> = [];
  let liberado = false;
  const client = { async query(sql: string, params?: any[]) {
    queries.push({ sql, params });
    if (sql.startsWith('select cod_municipio')) return { rows: [{ cod_municipio_ibge: '3550308', serie_dps: '1', xml_nota_referencia_url: 'ref' }] };
    if (sql.startsWith('select id,')) return { rows: Array.from({ length: quantidade }, () => ({ id: 's', ctrib_nac: '040101', cnbs: null, ctrib_mun: null, parametros_emissao: null })) };
    if (falhar && sql.includes('set parametros_emissao')) throw new Error('Falha de gravação');
    return { rows: [] };
  }, release() { liberado = true; } };
  return { pool: { async connect() { return client; } } as any, queries, liberado: () => liberado };
}
test('grava política, perfil e auditoria na mesma transação e preserva zero', async () => {
  const c = montar();
  await confirmarPoliticaEmissao(c.pool, { medicoId: 'm', parametrosEmissao: parametros });
  const politica = JSON.parse(c.queries.find(q => q.sql.includes('set parametros_emissao'))!.params![2]);
  assert.equal(politica.parametros.percentualTotTribSN, 0);
  assert.equal(politica.perfil.referencia, 'ref');
  assert.ok(c.queries.some(q => q.sql.includes('insert into auditoria')));
  assert.equal(c.queries.at(-1)?.sql, 'commit');
  assert.equal(c.liberado(), true);
});
test('falha de gravação ou múltiplos serviços reverte confirmação', async () => {
  for (const c of [montar(true), montar(false, 2)]) {
    await assert.rejects(() => confirmarPoliticaEmissao(c.pool, { medicoId: 'm', parametrosEmissao: parametros }));
    assert.equal(c.queries.at(-1)?.sql, 'rollback');
    assert.equal(c.liberado(), true);
  }
});
test('parâmetro não suportado é rejeitado antes de conectar', async () => {
  const c = montar();
  await assert.rejects(() => confirmarPoliticaEmissao(c.pool, { medicoId: 'm', parametrosEmissao: { ...parametros, tpRetISSQN: 2 } }));
  assert.equal(c.queries.length, 0);
});
