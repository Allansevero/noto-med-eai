/** Cobertura das decisões que bloqueiam envio ou escolhem dados de fontes revisadas. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepararEmissao, type EvidenciasEmissao } from './preparar-emissao.js';
import { parametrosEmissaoSchema } from './parametros-emissao.js';
const item = { id: 's', medicoId: 'm', pacienteId: 'p', xdescServ: 'Consulta', valorServicoCentavos: 15000, ctribNac: '040101' };
function evidencias(): EvidenciasEmissao {
  const perfil = { ambiente: 'homologacao', confirmado: true, opcao: 'me_epp', regime: 'regime_2', especial: 0, municipio: '3550308', serie: '12', referencia: 'xml/1' };
  return { perfil, competenciaInformada: null, datasConsultas: ['2026-10-01'], servicos: [{
    id: 'servico', ctribNac: '040101', cnbs: '122051900', ctribMun: '001', politica: {
      origem: 'revisao_onboarding', confirmadoEm: '2026-10-01T00:00:00Z', ctribNac: '040101', cnbs: '122051900', ctribMun: '001', perfil,
      parametros: { ambiente: 'homologacao', vigenciaInicio: '2026-10-01', vigenciaFim: '2026-10-31', municipioPrestacao: '3304557',
        opcaoSimplesNacional: 'me_epp', regimeApuracaoSn: 'regime_2', regimeEspecialTributacao: 0,
        tribISSQN: 1, tpRetISSQN: 1, cstPisCofins: '06', percentualTotTribSN: 0 }
    }
  }] };
}
test('resolve serviço, local e competência e preserva percentual zero confirmado', () => {
  const r = prepararEmissao(item, evidencias(), '2026-10-04');
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.parametros.percentualTotTribSN, 0);
  assert.equal(r.parametros.municipioPrestacao, '3304557');
  assert.equal(r.competencia, '2026-10-01');
  assert.equal(r.origem.competencia, 'consulta_vinculada');
});
test('não escolhe a primeira configuração quando existem duas', () => {
  const e = evidencias(); e.servicos.push(e.servicos[0]);
  const r = prepararEmissao(item, e, '2026-10-04');
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.pendencias.some(p => p.codigo === 'SERVICO_AMBIGUO'));
});
for (const alteracao of ['sem_politica', 'sem_confirmacao', 'perfil_alterado', 'fora_vigencia', 'competencia_ambigua', 'classificacao_divergente', 'reforma', 'valor_invalido']) {
  test(`bloqueia ${alteracao} antes de criar DPS`, () => {
    const e = evidencias(), i = { ...item, cclassTrib: '' };
    if (alteracao === 'sem_politica') e.servicos[0].politica = null;
    if (alteracao === 'sem_confirmacao') e.perfil.confirmado = false;
    if (alteracao === 'perfil_alterado') e.perfil = { ...e.perfil, referencia: 'novo-xml' };
    if (alteracao === 'fora_vigencia') e.datasConsultas = ['2026-09-30'];
    if (alteracao === 'competencia_ambigua') e.datasConsultas.push('2026-10-02');
    if (alteracao === 'classificacao_divergente') i.ctribNac = '080201';
    if (alteracao === 'reforma') i.cclassTrib = '000001';
    if (alteracao === 'valor_invalido') i.valorServicoCentavos = -1;
    assert.equal(prepararEmissao(i, e, '2026-10-04').ok, false);
  });
}
test('MEI não exige percentual ou CST e não herda defaults do Simples', () => {
  const e = evidencias();
  e.perfil = { ...e.perfil, opcao: 'mei', regime: null };
  const p = e.servicos[0].politica!;
  p.perfil = e.perfil;
  p.parametros = { ambiente: 'homologacao', vigenciaInicio: '2026-01-01', municipioPrestacao: '3550308', opcaoSimplesNacional: 'mei', regimeEspecialTributacao: 0, tribISSQN: 1, tpRetISSQN: 1 };
  assert.equal(prepararEmissao(item, e, '2026-10-04').ok, true);
  assert.equal(parametrosEmissaoSchema.safeParse({ ...p.parametros, cstPisCofins: '08' }).success, false);
});
test('retido, não optante e CST com cálculo adicional não são substituídos silenciosamente', () => {
  const p = evidencias().servicos[0].politica!.parametros;
  for (const mudanca of [{ tpRetISSQN: 2 }, { opcaoSimplesNacional: 'nao_optante' }, { cstPisCofins: '01' }, { percentualTotTribSN: undefined }, { ambiente: 'homologacao', vigenciaInicio: '2026-02-30' }]) {
    assert.equal(parametrosEmissaoSchema.safeParse({ ...p, ...mudanca }).success, false);
  }
});
