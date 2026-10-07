import assert from 'node:assert/strict';
import { test } from 'node:test';
import forge from 'node-forge';
import { XMLParser } from 'fast-xml-parser';
import { PostgresEmissorDpsService } from './postgres-emissor-dps-service.js';

test('worker transmite a política não optante sem converter o regime para ME/EPP', async () => {
  const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const parametros = { ambiente: 'homologacao', vigenciaInicio: hoje, municipioPrestacao: '3550308',
    opcaoSimplesNacional: 'nao_optante', regimeEspecialTributacao: 0, tribISSQN: 1, tpRetISSQN: 1,
    aliquotaIss: 2, cstPisCofins: '08', totalTributos: { tipo: 'nao_informado' } };
  const referencia = { versao: 2, hash: 'hash', pendencias: [], parametrosSugeridos: parametros,
    servico: { ctribNac: '040101', ctribMun: null, cnbs: null } };
  const perfil = { ambiente: 'homologacao', opcao: 'nao_optante', regime: null, especial: 0,
    municipio: '3550308', serie: '12', referencia: 'ref.xml' };
  const politica = { parametros, referenciaHash: 'hash', fidelidadeReferencia: true, confirmadoEm: new Date().toISOString(),
    origem: 'revisao_onboarding', ctribNac: '040101', ctribMun: null, cnbs: null, perfil };
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = '01';
  cert.validity.notBefore = new Date(); cert.validity.notAfter = new Date('2030-01-01');
  cert.setSubject([{ name: 'commonName', value: 'CLINICA TESTE' }]);
  cert.setIssuer([{ name: 'commonName', value: 'CLINICA TESTE' }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const pfx = Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'teste')).getBytes(), 'binary');
  const pool = { async query(sql: string) {
        if (sql.startsWith('select nome_completo, crm, rqe, especialidade from medicos')) return { rows: [{ nome_completo: 'João da Silva', crm: '12345/SP' }] };
    if (sql.includes('from solicitacoes_nota s')) return { rows: [{ ...perfil, confirmado: true, referencia_fiscal: referencia,
      competencia: hoje, datas: [], servicos: [{ id: 'serv', ctribNac: '040101', ctribMun: null, cnbs: null, politica }] }] };
    if (sql.includes('from medico_perfil_fiscal pf')) return { rows: [{ documento_limpo: '11222333000181',
      inscricao_municipal: '', razao_social: 'Clinica Teste', uf: 'SP', cod_municipio_ibge: '3550308', serie_dps: '12',
      proximo_numero_dps: 43, ambiente: 'homologacao', opcao_simples_nacional: 'nao_optante',
      regime_apuracao_sn: null, regime_especial_tributacao: 0, dados_reforma_tributaria: referencia }] };
    if (sql.includes('from pacientes')) return { rows: [{ cpf_limpo: '12345678909', nome: 'Maria Silva', nome_validado: true }] };
    if (sql.includes('max(ndps)')) return { rows: [{ proximo: '43' }] };
    if (sql.includes('from medico_certificados')) return { rows: [{ id: 'cert', arquivo_storage_path: 'teste.pfx', senha_secret_id: 'senha', valido_ate: '2030-01-01' }] };
    if (sql.includes('vault.decrypted_secrets')) return { rows: [{ secret: 'teste' }] };
    throw new Error(`Consulta inesperada: ${sql}`);
  } } as any;
  const storage = { storage: { from: () => ({ download: async () => ({ data: { arrayBuffer: async () => pfx }, error: null }) }) } } as any;
  const enviados: string[] = [];
  const sefin = { async transmitirDps(input: any) {
    enviados.push(input.xmlAssinado);
    return { sucesso: false, codigoErro: 'TESTE', motivo: 'Rejeição simulada' };
  } } as any;
  const emissor = new PostgresEmissorDpsService(pool, 'teste', undefined, undefined, storage, sefin, true, true);
  const resultado = await emissor.emitir({ id: 'sol', medicoId: 'med', pacienteId: 'pac', valorServicoCentavos: 17005,
    ctribNac: '040101', cnbs: '', xdescServ: 'REFERENTE A CONSULTAS MÉDICAS COM DR.(A) MÉDICO 9886 NAS DATAS 07/10/2026' });
  assert.equal(resultado.sucesso, false);
  assert.equal(enviados.length, 1);
  const dps = new XMLParser({ parseTagValue: false }).parse(enviados[0]).DPS.infDPS;
  assert.equal(dps.serv.cServ.xDescServ, 'REFERENTE A CONSULTAS MÉDICA COM DR.(A) JOÃO DA SILVA VINCULADO CRM 12345/SP NAS DATAS 07/10/2026');
  assert.equal(dps.prest.regTrib.opSimpNac, '1');
  assert.equal(dps.prest.regTrib.regApTribSN, undefined);
  assert.deepEqual(dps.valores.trib, { tribMun: { tribISSQN: '1', tpRetISSQN: '1', pAliq: '2.00' },
    tribFed: { piscofins: { CST: '08' } }, totTrib: { indTotTrib: '0' } });
});
