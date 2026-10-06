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
test('revisão fiscal altera razão social e especialidade sem substituir nome, CRM e RQE', async () => {
  const c = montar();
  await confirmarPoliticaEmissao(c.pool, { medicoId: 'm', parametrosEmissao: parametros,
    razaoSocial: 'Clínica Exemplo Ltda', especialidade: 'Cardiologia' });
  const update = c.queries.find(q => q.sql.includes('update medicos'))!;
  assert.deepEqual(update.params, ['m', 'Cardiologia']);
  assert.doesNotMatch(update.sql, /nome_completo|crm|rqe/);
  assert.ok(c.queries.some(q => q.sql.includes('set razao_social') && q.params?.[1] === 'Clínica Exemplo Ltda'));
  assert.equal(c.queries.at(-1)?.sql, 'commit');
});

test('pendências da referência explicam todos os campos bloqueados sem expor valores técnicos', async () => {
  const pendencias = ['aliquotaIss: Number must be less than or equal to 9.99',
    'totalTributos: Invalid discriminator value', 'tpRetISSQN: Invalid literal value'];
  const queries: string[] = [];
  const pool = { async connect() { return { async query(sql: string) {
    queries.push(sql);
    if (sql.startsWith('select cod_municipio')) return { rows: [{ dados_reforma_tributaria: {
      versao: 2, hash: 'ref', pendencias, parametrosSugeridos: {} } }] };
    if (sql.startsWith('select id,')) return { rows: [{ id: 's' }] };
    return { rows: [] };
  }, release() {} }; } } as any;
  await assert.rejects(() => confirmarPoliticaEmissao(pool, { medicoId: 'm', usarReferencia: true, referenciaHash: 'ref' }), (erro: any) => {
    assert.equal(erro.codigo, 'REFERENCIA_FISCAL_PENDENTE');
    assert.match(erro.message, /alíquota de ISS/);
    assert.match(erro.message, /totalização dos tributos/);
    assert.match(erro.message, /retenção de ISS/);
    assert.doesNotMatch(erro.message, /Invalid|Number must|9\.99/);
    assert.deepEqual(erro.diagnostico.campos, ['aliquotaIss', 'totalTributos', 'tpRetISSQN']);
    assert.deepEqual(erro.diagnostico.pendencias, pendencias);
    return true;
  });
  assert.equal(queries.at(-1), 'rollback');
  assert.ok(!queries.some(q => q.startsWith('update')));
});
