/** Fluxo com I/O simulado: compara XML persistido, usa cache e nunca escreve a política de emissão. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { compararPerfilFiscal } from './comparar-perfil-fiscal.js';
import { gerarHashCpf } from '../../paciente/hash-cpf.js';

const documento = '11222333000181';
const xml = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe>
<emit><CNPJ>${documento}</CNPJ><xNome>Clínica Teste</xNome></emit><cLocIncid>3550308</cLocIncid>
<DPS versao="1.01"><infDPS><cLocEmi>3550308</cLocEmi><prest><CNPJ>${documento}</CNPJ><regTrib><opSimpNac>3</opSimpNac></regTrib></prest>
<serv><cServ><cTribNac>040101</cTribNac></cServ></serv>
<IBSCBS><finNFSe>0</finNFSe><cIndOp>100301</cIndOp><indDest>0</indDest><valores><trib><gIBSCBS><CST>000</CST><cClassTrib>000001</cClassTrib></gIBSCBS></trib></valores></IBSCBS>
<toma><CPF>12345678909</CPF><xNome>Paciente que não deve ser registrado</xNome></toma>
</infDPS></DPS></infNFSe></NFSe>`;

function cenario(semReferencia = false) {
  const hash = createHash('sha256').update(xml).digest('hex');
  const perfil: any = semReferencia ? undefined : { cpf_cnpj_hash: gerarHashCpf(documento, 'pepper'),
    razao_social: 'Clínica Teste', cod_municipio_ibge: '3550308', ctrib_nac: '040101', ambiente: 'producao',
    xml_nota_referencia_url: 'referencia.xml', dados_reforma_tributaria: { hash, competencia: '2026-10-01', numero: '42', pendencias: [],
      parametrosSugeridos: { opcaoSimplesNacional: 'me_epp', ibscbs: { finNFSe: '0', cIndOp: '100301', indDest: '0', CST: '000', cClassTrib: '000001' } } } };
  let cache: any; let cadastralChamadas = 0; let trocou = false;
  const escritas: { sql: string; args: any[] }[] = [];
  const pool: any = { async query(sql: string, args: any[] = []) {
    if (sql.startsWith('select p.*')) return { rows: perfil ? [perfil] : [] };
    if (sql.startsWith('select evidencias')) return { rows: cache ? [cache] : [] };
    if (sql.startsWith('select c.id')) return { rows: [{ certificado_id: trocou ? 'novo' : 'cert', referencia_hash: perfil?.dados_reforma_tributaria.hash ?? null }] };
    escritas.push({ sql, args }); cache = { evidencias: JSON.parse(args[6]), consultado_em: args[7] }; return { rows: [] };
  } };
  const deps = { pool, pepper: 'pepper', supabase: { storage: { from: () => ({ download: async () => ({ data: { text: async () => xml }, error: null }) }) } } as any,
    agora: () => new Date('2026-10-05T12:00:00Z'),
    carregarCertificado: async () => ({ id: 'cert', medicoId: 'med', pfxBuffer: Buffer.from('a1'), senhaCertificado: 'senha-secreta', arquivoStoragePath: 'a1', validoAte: new Date('2027-01-01') }),
    extrairCertificado: () => ({ documentoTitular: documento, validoAte: new Date('2027-01-01'), pemKey: '', pemCert: '', certBase64: '' }),
    cadastro: async () => { cadastralChamadas++; return { fonte: 'Cadastro', estado: 'consultada' as const, mensagem: '',
      dados: { razaoSocial: 'Clínica Teste', municipioEmitente: '3550308', opcaoSimplesNacional: 'me_epp' } }; },
    municipio: async () => ({ convenio: { fonte: 'ADN', estado: 'consultada' as const, mensagem: '', dados: {} },
      aliquota: { fonte: 'ADN', estado: 'indisponivel' as const, mensagem: 'Sem informação', dados: {} } }) };
  return { deps, perfil, escritas, cadastralChamadas: () => cadastralChamadas, trocar: () => { trocou = true; } };
}

test('importação de referência + consultas gera comparação persistida sem alterar regras ou expor paciente/segredos', async () => {
  const c = cenario(); const relatorio = await compararPerfilFiscal(c.deps, 'med');
  assert.equal(relatorio.estado, 'comparacao_parcial'); assert.equal(relatorio.divergencias, 0);
  assert.equal(relatorio.linhas.find(l => l.campo === 'ibscbs.cClassTrib')!.preparado, '000001');
  assert.equal(c.escritas.length, 1);
  assert.ok(c.escritas.every(q => q.sql.startsWith('insert into consultas_fiscais_onboarding')));
  const persistido = JSON.stringify(c.escritas);
  for (const proibido of [documento, '12345678909', 'Paciente que', 'senha-secreta', '<NFSe']) assert.equal(persistido.includes(proibido), false);
  const repetido = await compararPerfilFiscal(c.deps, 'med');
  assert.equal(c.cadastralChamadas(), 1); assert.equal(c.escritas.length, 1);
  assert.equal(repetido.consultadoEm, relatorio.consultadoEm);
});
test('sem XML ainda consulta cadastro, mas não declara que a nota padrão foi conferida', async () => {
  const c = cenario(true); const relatorio = await compararPerfilFiscal(c.deps, 'med');
  assert.equal(relatorio.estado, 'sem_referencia'); assert.equal(c.cadastralChamadas(), 1);
  assert.equal(relatorio.politicaConfirmada, false);
});
test('mudança do A1, XML adulterado e outro titular impedem associar evidências incorretas', async () => {
  const mudou = cenario(); mudou.trocar();
  await assert.rejects(() => compararPerfilFiscal(mudou.deps, 'med'), /mudou durante/);
  assert.equal(mudou.escritas.length, 0);
  const adulterado = cenario(); adulterado.perfil.dados_reforma_tributaria.hash = 'outro';
  await assert.rejects(() => compararPerfilFiscal(adulterado.deps, 'med'), /XML de referência mudou/);
  assert.equal(adulterado.cadastralChamadas(), 0);
  const titular = cenario(); titular.perfil.cpf_cnpj_hash = 'outro';
  await assert.rejects(() => compararPerfilFiscal(titular.deps, 'med'), /titulares diferentes/);
  assert.equal(titular.cadastralChamadas(), 0);
});
