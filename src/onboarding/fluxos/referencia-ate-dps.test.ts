/** Regressão do caminho completo da referência importada até uma nova DPS. Fixture sintética. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XMLParser } from 'fast-xml-parser';
import { processarOnboardingXml } from './processar-onboarding-xml.js';
import { confirmarPoliticaEmissao } from '../io/confirmar-politica-emissao.js';
import { prepararEmissao } from '../../fiscal/preparacao/preparar-emissao.js';
import { gerarXmlDps } from '../../io/fiscal/gerar-xml-dps.js';
import { validarReferenciaFiscal } from '../../fiscal/preparacao/validar-referencia-fiscal.js';

const xml = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe>
<emit><CNPJ>11222333000181</CNPJ><xNome>Clínica Referência</xNome></emit><nNFSe>42</nNFSe>
<IBSCBS><valores><vBC>999.99</vBC></valores></IBSCBS>
<DPS versao="1.01"><infDPS Id="REFERENCIA"><tpAmb>2</tpAmb><dhEmi>2026-10-01T10:00:00-03:00</dhEmi>
<verAplic>Prefeitura</verAplic><serie>12</serie><nDPS>42</nDPS><dCompet>2026-10-01</dCompet><tpEmit>1</tpEmit><cLocEmi>3550308</cLocEmi>
<prest><CNPJ>11222333000181</CNPJ><regTrib><opSimpNac>3</opSimpNac><regApTribSN>1</regApTribSN><regEspTrib>0</regEspTrib></regTrib></prest>
<toma><CPF>12345678909</CPF><xNome>Paciente Anterior</xNome></toma>
<serv><locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest><cServ><cTribNac>040101</cTribNac><cTribMun>001</cTribMun><xDescServ>Consulta</xDescServ><cNBS>122051900</cNBS></cServ></serv>
<valores><vServPrest><vServ>999.99</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN></tribMun>
<tribFed><piscofins><CST>06</CST></piscofins></tribFed><totTrib><pTotTribSN>0.00</pTotTribSN></totTrib></trib></valores>
<IBSCBS><finNFSe>0</finNFSe><indFinal>1</indFinal><cIndOp>100301</cIndOp><indDest>0</indDest>
<valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores></IBSCBS>
</infDPS></DPS></infNFSe></NFSe>`;

function contexto(falha?: 'storage' | 'servico') {
  const queries: string[] = []; let referencia: any; let politica: any; let caminho: string;
  const client = { async query(sql: string, args: any[] = []): Promise<any> {
    queries.push(sql);
    if (sql.includes('insert into medico_perfil_fiscal')) { referencia = JSON.parse(args[19]); caminho = args[20]; }
    if (falha === 'servico' && sql.includes('insert into medico_servicos_fiscais')) throw new Error('serviço indisponível');
    if (sql.startsWith('select cod_municipio')) return { rows: [{ cod_municipio_ibge: '3550308', serie_dps: '12', xml_nota_referencia_url: caminho, dados_reforma_tributaria: referencia }] };
    if (sql.startsWith('select id,')) return { rows: [{ id: 'serv', ctrib_nac: '040101', ctrib_mun: '001', cnbs: '122051900', parametros_emissao: null }] };
    if (sql.includes('set parametros_emissao = $3')) politica = JSON.parse(args[2]);
    return { rows: [] };
  }, release() {} };
  const pool = { async connect() { return client; } } as any;
  const deps = { pool, chaveCriptografia: 'teste', pepperCpf: 'teste', documentoTitularEsperado: '11222333000181',
    supabase: { storage: { from: () => ({ async upload() { return { error: falha === 'storage' ? new Error('storage') : null }; } }) } } as any };
  return { deps, queries, referencia: () => referencia, politica: () => politica };
}

test('importa IBS/CBS, persiste, confirma e usa os códigos na nova DPS sem copiar paciente ou tributos calculados', async () => {
  const c = contexto();
  const importacao = await processarOnboardingXml(c.deps, 'med', xml);
  assert.equal(importacao.parametros.cclassTribPadrao, '000001');
  assert.equal(importacao.parametros.cindOpPadrao, '100301');
  assert.deepEqual(c.referencia().pendencias, []);
  assert.ok(!JSON.stringify(c.referencia()).includes('Paciente Anterior'));
  assert.match(c.referencia().hash, /^[a-f0-9]{64}$/);
  const parametros: any = { ...c.referencia().parametrosSugeridos, vigenciaInicio: '2026-10-01' };
  await confirmarPoliticaEmissao(c.deps.pool, { medicoId: 'med', parametrosEmissao: parametros, referenciaHash: c.referencia().hash });
  const politica = c.politica();
  const item = { id: 'sol', medicoId: 'med', pacienteId: 'p', ctribNac: '040101', cnbs: '122051900', xdescServ: 'Nova consulta', valorServicoCentavos: 17005 };
  const preparo = prepararEmissao(item, { perfil: { ...politica.perfil, confirmado: true, referenciaFiscal: c.referencia() },
    competenciaInformada: '2026-10-02', datasConsultas: [], servicos: [{ id: 'serv', ctribNac: '040101', cnbs: '122051900', ctribMun: '001', politica }] }, '2026-10-05');
  assert.ok(preparo.ok);
  const resultado = gerarXmlDps({ nDPS: '43', tomador: { CPF: '98765432100', xNome: 'Paciente Novo' },
    xDescServ: item.xdescServ, vServ: 170.05, cTribNac: item.ctribNac, cNBS: item.cnbs, cTribMun: '001', cIndOp: '', cClassTrib: '',
    fiscal: { ...preparo.parametros, competencia: preparo.competencia } }, {
    cnpj: '11222333000181', im: '', codMunicipio: '3550308', ambiente: 2, serie: '12', pTotTribSN: 9,
    regTrib: { opSimpNac: 3, regApTribSN: 1, regEspTrib: 0 }
  });
  const dps = new XMLParser({ parseTagValue: false }).parse(resultado.xml).DPS.infDPS;
  assert.equal(dps.IBSCBS.valores.trib.gIBSCBS.CST, '000');
  assert.equal(dps.IBSCBS.valores.trib.gIBSCBS.cClassTrib, '000001');
  assert.equal(dps.IBSCBS.cIndOp, '100301');
  assert.equal(dps.dCompet, '2026-10-02');
  assert.equal(dps.valores.vServPrest.vServ, '170.05');
  assert.equal(dps.valores.trib.totTrib.pTotTribSN, '0.00');
  assert.ok(!resultado.xml.includes('999.99') && !resultado.xml.includes('Paciente Anterior'));
});

test('campos adicionais de IBS/CBS são registrados e impedem confirmação, sem descarte silencioso', async () => {
  const c = contexto();
  await processarOnboardingXml(c.deps, 'med', xml.replace('<indDest>0</indDest>', '<tpEnteGov>1</tpEnteGov><indDest>0</indDest>'));
  assert.ok(c.referencia().pendencias.some((p: string) => p.includes('tpEnteGov')));
  await assert.rejects(() => confirmarPoliticaEmissao(c.deps.pool, { medicoId: 'med', referenciaHash: c.referencia().hash,
    parametrosEmissao: { ...c.referencia().parametrosSugeridos, vigenciaInicio: '2026-10-01' } }), /tpEnteGov/);
  assert.equal(c.queries.at(-1), 'rollback');
});

test('referência diferente ou remoção de IBS/CBS invalida aprovação', async () => {
  const c = contexto(); await processarOnboardingXml(c.deps, 'med', xml);
  assert.ok(validarReferenciaFiscal(c.referencia(), { referenciaHash: 'antiga', parametros: c.referencia().parametrosSugeridos }).length);
  assert.ok(validarReferenciaFiscal(c.referencia(), { referenciaHash: c.referencia().hash, parametros: {} }).length);
});

test('titular divergente e falha no storage não alteram cadastro; falha ao salvar serviço reverte transação', async () => {
  const titular = contexto();
  await assert.rejects(() => processarOnboardingXml({ ...titular.deps, documentoTitularEsperado: '99999999000199' }, 'med', xml), /titular/);
  assert.equal(titular.queries.length, 0);
  const storage = contexto('storage');
  await assert.rejects(() => processarOnboardingXml(storage.deps, 'med', xml), /preservar/);
  assert.equal(storage.queries.length, 0);
  const servico = contexto('servico');
  await assert.rejects(() => processarOnboardingXml(servico.deps, 'med', xml), /serviço/);
  assert.equal(servico.queries.at(-1), 'rollback');
});
