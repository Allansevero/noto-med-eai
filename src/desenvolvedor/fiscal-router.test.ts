import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import forge from 'node-forge';
import { XMLParser } from 'fast-xml-parser';
import { criarRouterFiscalDesenvolvedor } from './fiscal-router.js';

const token = 'segredo-de-teste-com-mais-de-trinta-e-dois-caracteres';
const xml = `<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe><nNFSe>77</nNFSe><emit><CNPJ>11222333000181</CNPJ><xNome>Clinica Teste</xNome></emit><DPS versao="1.01"><infDPS><tpAmb>1</tpAmb><dhEmi>2026-10-01T10:00:00-03:00</dhEmi><dCompet>2026-10-01</dCompet><tpEmit>1</tpEmit><serie>1</serie><nDPS>77</nDPS><cLocEmi>3550308</cLocEmi><prest><CNPJ>11222333000181</CNPJ><regTrib><opSimpNac>1</opSimpNac><regEspTrib>0</regEspTrib></regTrib></prest><toma><CPF>12345678909</CPF><xNome>Paciente Anterior</xNome></toma><serv><locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest><cServ><cTribNac>040101</cTribNac><xDescServ>Consulta de Paciente Anterior</xDescServ></cServ></serv><valores><vServPrest><vServ>999.99</vServ></vServPrest><trib><tribMun><tribISSQN>1</tribISSQN><tpRetISSQN>1</tpRetISSQN><pAliq>2.00</pAliq></tribMun><tribFed><piscofins><CST>08</CST></piscofins></tribFed><totTrib><indTotTrib>0</indTotTrib></totTrib></trib></valores></infDPS></DPS></infNFSe></NFSe>`;
function certificado() {
  const keys = forge.pki.rsa.generateKeyPair(1024), cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey; cert.serialNumber = '01';
  cert.validity.notBefore = new Date('2020-01-01'); cert.validity.notAfter = new Date('2030-01-01');
  cert.setSubject([{ name: 'commonName', value: 'CLINICA TESTE:11222333000181' }]);
  cert.setIssuer([{ name: 'commonName', value: 'CLINICA TESTE:11222333000181' }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return Buffer.from(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], 'senha-teste')).getBytes(), 'binary').toString('base64');
}
const arquivoBase64 = certificado();
const consulta = { cpfPaciente: '12345678909', nomePaciente: 'Maria Silva', valorCentavos: 17005,
  competencia: '2026-10-05', descricao: 'Consulta médica de teste', serieDps: '900', numeroDps: '12345' };
async function ambiente(t: any, opcoes: any = {}) {
  const enviados: any[] = [], logs: any[] = [], certificados: Buffer[] = [];
  let consultasAdn = 0, agora = new Date('2026-10-06T01:00:00Z');
  const app = express(); app.use(express.json({ limit: '4mb' }));
  app.use('/api/desenvolvedor/fiscal', criarRouterFiscalDesenvolvedor({ ativo: opcoes.ativo ?? true, token,
    agora: () => agora, registrar: (evento: any) => logs.push(evento),
    adn: { async buscarNfseMaisRecente(pfx: Buffer) { certificados.push(pfx); consultasAdn++; return { documento: { nsu: 1, xml: opcoes.xml ?? xml }, maxNsu: 1, resumo: { lotesConsultados: 1, documentosConsultados: 1, notasDoTitular: 1, dataEmissaoSelecionada: '2026-10-01T13:00:00Z' } }; } },
    sefin: { async transmitirDps(input: any) {
      enviados.push(input); if (opcoes.esperar) await opcoes.esperar;
      return opcoes.resultado ?? { sucesso: false, httpStatus: 422, codigoErro: 'E0116', motivo: 'Inscrição municipal inválida', respostaRaw: { erros: [{ Codigo: 'E0116' }] } };
    } }
  }));
  const server = await new Promise<any>((resolve, reject) => { const s = app.listen(0, '127.0.0.1', (erro?: Error) => erro ? reject(erro) : resolve(s)); });
  t.after(() => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); }));
  const url = `http://127.0.0.1:${server.address().port}/api/desenvolvedor/fiscal`;
  const pedir = async (rota: string, body?: any, chave = token, metodo = 'POST') => {
    const res = await fetch(url + rota, { method: body ? metodo : 'GET', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: res.status, data: await res.json() };
  };
  const importar = () => pedir('/referencia', { arquivoBase64, senha: 'senha-teste' });
  return { pedir, importar, enviados, logs, certificados, consultas: () => consultasAdn, avancar: (ms: number) => { agora = new Date(agora.getTime() + ms); } };
}
test('desativado ou sem chave não abre certificado nem consulta ADN', async t => {
  for (const ativo of [false, true]) {
    const a = await ambiente(t, { ativo });
    const r = await a.pedir('/referencia', { arquivoBase64, senha: 'senha-teste' }, 'invalida');
    assert.equal(r.status, ativo ? 401 : 404); assert.equal(a.consultas(), 0);
  }
});
test('extrai referência real e transmite apenas nova DPS em homologação; repetição não retransmite', async t => {
  const a = await ambiente(t), ref = await a.importar();
  assert.equal(ref.status, 200); assert.equal(ref.data.referencia.ambienteOrigem, 'producao');
  assert.equal(ref.data.referencia.ambienteEmissao, 'homologacao');
  assert.deepEqual(ref.data.pendencias, []);
  assert.ok(!JSON.stringify(ref.data).includes('Paciente Anterior'));
  assert.ok(!JSON.stringify(ref.data).includes(arquivoBase64));
  const sessaoId = ref.data.sessaoId;
  const prep = await a.pedir('/preparar', { sessaoId, ...consulta });
  assert.equal(prep.status, 200); assert.equal(a.enviados.length, 0);
  const dps = new XMLParser({ parseTagValue: false }).parse(prep.data.xmlDpsAssinado).DPS.infDPS;
  assert.equal(dps.tpAmb, '2'); assert.equal(dps.valores.vServPrest.vServ, '170.05');
  assert.equal(dps.prest.regTrib.opSimpNac, '1'); assert.equal(dps.toma.xNome, 'Maria Silva');
  const input = { sessaoId, tentativaId: prep.data.tentativaId, confirmarHomologacao: true };
  const emitida = await a.pedir('/emitir', input);
  assert.equal(emitida.data.estado, 'rejeitada'); assert.equal(emitida.data.codigoErro, 'E0116');
  assert.equal(a.enviados[0].ambiente, 2);
  await a.pedir('/emitir', input); assert.equal(a.enviados.length, 1);
  const historico = await a.pedir(`/sessoes/${sessaoId}`);
  assert.equal(historico.data.tentativas[0].estado, 'rejeitada');
  assert.ok(!JSON.stringify(a.logs).includes('senha-teste'));
  assert.ok(!JSON.stringify(a.logs).includes('12345678909'));
});
test('não aceita ambiente/tributos do navegador nem CPF inválido; referência divergente bloqueia', async t => {
  const a = await ambiente(t), ref = await a.importar(), sessaoId = ref.data.sessaoId;
  for (const mudanca of [{ ambiente: 'producao' }, { parametrosFiscais: {} }, { cpfPaciente: '11111111111' }, { competencia: '2026-02-30' }]) {
    assert.equal((await a.pedir('/preparar', { sessaoId, ...consulta, ...mudanca })).status, 400);
  }
  const outro = await ambiente(t, { xml: xml.replaceAll('11222333000181', '99999999000199') });
  assert.equal((await outro.importar()).status, 422); assert.equal(outro.enviados.length, 0);
  assert.equal(a.enviados.length, 0);
});
test('sessão expirada impede envio; pendências fiscais não são contornadas no teste', async t => {
  const a = await ambiente(t), ref = await a.importar(); a.avancar(16 * 60 * 1000);
  assert.equal((await a.pedir('/preparar', { sessaoId: ref.data.sessaoId, ...consulta })).status, 410);
  const b = await ambiente(t, { xml: xml.replace('</tribMun>', '<campoNovo>1</campoNovo></tribMun>') });
  const pendente = await b.importar(); assert.ok(pendente.data.pendencias.length > 0);
  assert.equal((await b.pedir('/preparar', { sessaoId: pendente.data.sessaoId, ...consulta })).status, 422);
  assert.equal(b.enviados.length, 0);
});
test('envio concorrente e resultado incerto não provocam outra transmissão', async t => {
  let liberar!: () => void;
  const a = await ambiente(t, { esperar: new Promise<void>(r => { liberar = r; }), resultado: { sucesso: false, motivo: 'Timeout' } });
  const ref = await a.importar(), sessaoId = ref.data.sessaoId;
  const prep = await a.pedir('/preparar', { sessaoId, ...consulta });
  const input = { sessaoId, tentativaId: prep.data.tentativaId, confirmarHomologacao: true };
  const primeira = a.pedir('/emitir', input);
  for (let i = 0; !a.enviados.length && i < 200; i++) await new Promise(r => setTimeout(r, 5));
  assert.equal(a.enviados.length, 1);
  assert.equal((await a.pedir('/emitir', input)).status, 409);
  liberar(); assert.equal((await primeira).data.estado, 'resultado_incerto');
  await a.pedir('/emitir', input); assert.equal(a.enviados.length, 1);
});

test('autorização disponibiliza NFS-e recebida; DPS de fallback não é apresentada como nota autorizada', async t => {
  for (const xmlAutorizado of ['<NFSe><infNFSe><nNFSe>88</nNFSe></infNFSe></NFSe>', '<DPS><infDPS/></DPS>']) {
    const a = await ambiente(t, { resultado: { sucesso: true, chaveAcesso: '1'.repeat(50), numeroNfse: '88', xmlAutorizado,
      dataAutorizacao: new Date(), respostaRaw: {} } });
    const ref = await a.importar(), sessaoId = ref.data.sessaoId;
    const prep = await a.pedir('/preparar', { sessaoId, ...consulta });
    const input = { sessaoId, tentativaId: prep.data.tentativaId };
    assert.equal((await a.pedir('/emitir', input)).status, 400); assert.equal(a.enviados.length, 0);
    const resultado = await a.pedir('/emitir', { ...input, confirmarHomologacao: true });
    assert.equal(resultado.data.estado, 'autorizada');
    assert.equal(resultado.data.xmlNota, xmlAutorizado.startsWith('<NFSe>') ? xmlAutorizado : undefined);
  }
});
test('encerrar a sessão remove o A1 da memória e impede reutilizar uma DPS preparada', async t => {
  const a = await ambiente(t), ref = await a.importar(), sessaoId = ref.data.sessaoId;
  const prep = await a.pedir('/preparar', { sessaoId, ...consulta });
  assert.ok(a.certificados[0].some(b => b !== 0));
  await a.pedir(`/sessoes/${sessaoId}`, {}, token, 'DELETE');
  assert.ok(a.certificados[0].every(b => b === 0));
  assert.equal((await a.pedir('/emitir', { sessaoId, tentativaId: prep.data.tentativaId, confirmarHomologacao: true })).status, 410);
  assert.equal(a.enviados.length, 0);
});
