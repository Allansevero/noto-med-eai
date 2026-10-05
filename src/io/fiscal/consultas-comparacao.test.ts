/** Exercita os contratos externos e impede defaults fiscais quando uma fonte falha. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { consultarCadastroCnpj } from './consultar-cadastro-cnpj.js';
import { consultarParametrosMunicipais } from './consultar-parametros-municipais.js';

const cnpj = '11222333000181';
const fetchJson = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch;
test('cadastro preserva regime desconhecido e não confunde código TOM com IBGE', async () => {
  const r = await consultarCadastroCnpj(cnpj, fetchJson({ cnpj, razao_social: 'Clínica', codigo_municipio: 7107,
    opcao_pelo_simples: null, opcao_pelo_mei: null }));
  assert.equal(r.estado, 'consultada');
  assert.equal(r.dados.opcaoSimplesNacional, undefined);
  assert.equal(r.dados.municipioEmitente, undefined);
  assert.equal(JSON.stringify(r).includes(cnpj), false);
});
test('cadastro rejeita outro CNPJ, enquadramento conflitante e indisponibilidade', async () => {
  for (const d of [{ cnpj: '12345678000195', razao_social: 'Outra' },
    { cnpj, razao_social: 'Clínica', opcao_pelo_mei: true, opcao_pelo_simples: false }]) {
    assert.equal((await consultarCadastroCnpj(cnpj, fetchJson(d))).estado, 'indisponivel');
  }
  const r = await consultarCadastroCnpj(cnpj, fetchJson({}, 429));
  assert.equal(r.estado, 'indisponivel');
  assert.deepEqual(r.dados, {});
});
test('só consulta CNPJ e não transmite certificado ao cadastro público', async () => {
  let chamadas = 0;
  const fetcher = (async (url: any, init: any) => {
    chamadas++;
    assert.equal(url, `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
    assert.equal(init.body, undefined);
    assert.equal(init.redirect, 'error');
    return new Response(JSON.stringify({ cnpj, razao_social: 'Clínica', opcao_pelo_mei: false, opcao_pelo_simples: true }));
  }) as typeof fetch;
  assert.equal((await consultarCadastroCnpj('12345678909', fetcher)).estado, 'nao_aplicavel');
  assert.equal((await consultarCadastroCnpj(cnpj, fetcher)).dados.opcaoSimplesNacional, 'me_epp');
  assert.equal(chamadas, 1);
});

const entrada = { municipio: '3550308', municipioIncidencia: '4314902', servico: '040101001', competencia: '2026-10-01',
  ambiente: 'homologacao' as const, pfx: Buffer.from('teste'), senha: 'segredo-teste' };
test('consulta municípios corretos, ambiente e código exato; mantém alíquota como informação', async () => {
  const urls: string[] = [];
  const r = await consultarParametrosMunicipais(entrada, async (url, pfx, senha) => {
    urls.push(url); assert.equal(pfx, entrada.pfx); assert.equal(senha, entrada.senha);
    return { status: 200, corpo: JSON.stringify(url.endsWith('/convenio') ? { parametrosConvenio: { aderenteEmissorNacional: 1 } }
      : { aliquotas: { '040101001': [{ Aliq: 0, DtIni: '2026-01-01T00:00:00', DtFim: null }], '040101002': [{ Aliq: 5, DtIni: '2026-01-01' }] } }) };
  });
  assert.ok(urls.every(u => u.startsWith('https://adn.producaorestrita.nfse.gov.br/parametrizacao/')));
  assert.ok(urls.some(u => u.endsWith('/3550308/convenio')));
  assert.ok(urls.some(u => u.includes('/4314902/040101001/2026-10-01T00%3A00%3A00/aliquota')));
  assert.equal(r.aliquota.dados.aliquotaMunicipal, 0);
  assert.equal(r.aliquota.dados.aliquotaIss, undefined);
});
test('não escolhe alíquota ambígua, vencida, inválida nem de outro serviço', async () => {
  const data = { Aliq: 2, DtIni: '2026-01-01' };
  for (const aliquotas of [{ '040101001': [data, data] }, { '040101002': [data] },
    { '040101001': [{ ...data, DtFim: '2026-09-01' }] }, { '040101001': [{ ...data, DtIni: 'inválido' }] }]) {
    const r = await consultarParametrosMunicipais(entrada, async () => ({ status: 200, corpo: JSON.stringify({ aliquotas }) }));
    assert.equal(r.aliquota.estado, 'indisponivel');
    assert.deepEqual(r.aliquota.dados, {});
  }
});
test('não inventa município de incidência nem serviço e encerra falha HTTP', async () => {
  const urls: string[] = [];
  const r = await consultarParametrosMunicipais({ ...entrada, municipioIncidencia: undefined }, async url => {
    urls.push(url); return { status: 403, corpo: 'não autorizado' };
  });
  assert.equal(urls.length, 1); assert.equal(r.aliquota.estado, 'nao_aplicavel');
  assert.equal(r.convenio.estado, 'indisponivel');
});
