import test from 'node:test';
import assert from 'node:assert/strict';
import { GooglePlanilhasClient } from './google-client.js';

const config = { clientId: 'cliente', clientSecret: 'segredo', redirectUri: 'https://app.example/callback' };
const id = 'planilha_123456789';
function fixture(body: unknown, status = 200) {
  const requests: Array<{ url: URL; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    requests.push({ url: new URL(String(input)), init });
    return new Response(JSON.stringify(body), { status });
  };
  return { client: new GooglePlanilhasClient({ ...config, fetch: fetcher }), requests };
}

test('autorizacao usa PKCE e somente escopo de leitura sem segredo', () => {
  const url = new URL(fixture({}).client.urlAutorizacao('estado', 'desafio'));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('scope'), 'https://www.googleapis.com/auth/spreadsheets.readonly');
  for (const [key, value] of Object.entries({state:'estado', code_challenge:'desafio', code_challenge_method:'S256', response_type:'code', access_type:'offline', prompt:'consent', client_id:'cliente', redirect_uri:config.redirectUri})) assert.equal(url.searchParams.get(key), value);
  assert.equal(url.searchParams.has('client_secret'), false);
});

test('troca codigo com verificador em formulario e calcula expiracao', async () => {
  const { client, requests } = fixture({ access_token:'acesso', refresh_token:'renovacao', expires_in:3600, token_type:'Bearer' });
  const before = Date.now();
  const result = await client.trocarCodigo('codigo', 'verificador');
  assert.equal(result.accessToken, 'acesso'); assert.equal(result.refreshToken, 'renovacao');
  assert.ok(result.expiraEm >= before + 3600000 && result.expiraEm <= Date.now() + 3600000);
  assert.equal(requests[0].url.href, 'https://oauth2.googleapis.com/token');
  assert.equal(requests[0].init?.method, 'POST');
  const form = new URLSearchParams(String(requests[0].init?.body));
  assert.equal(form.get('code_verifier'), 'verificador'); assert.equal(form.get('client_secret'), 'segredo');
  assert.equal(form.get('grant_type'), 'authorization_code');
  assert.equal(requests[0].init?.redirect, 'error'); assert.ok(requests[0].init?.signal);
});

test('renovacao usa refresh_token e aceita resposta sem novo refresh token', async () => {
  const { client, requests } = fixture({ access_token:'novo', expires_in:60, token_type:'Bearer' });
  assert.equal((await client.renovar('original')).accessToken, 'novo');
  const form = new URLSearchParams(String(requests[0].init?.body));
  assert.equal(form.get('refresh_token'), 'original'); assert.equal(form.get('grant_type'), 'refresh_token');
});

test('respostas OAuth invalidas nao produzem credenciais utilizaveis', async () => {
  for (const body of [{access_token:'',expires_in:60}, {access_token:'x',expires_in:0}, {access_token:'x',expires_in:'60'}, {access_token:'x',expires_in:-1}, {access_token:'x',expires_in:60,refresh_token:4}]) {
    await assert.rejects(fixture(body).client.renovar('segredo'));
  }
});

test('erros de permissao e renovacao nao expoem corpo ou tokens', async () => {
  const { client } = fixture({error:'segredo-do-provedor'}, 403);
  for (const operation of [() => client.renovar('refresh-secreto'), () => client.abas('access-secreto', id)]) {
    await assert.rejects(operation, error => error instanceof Error && !/segredo|secreto|provedor/.test(error.message));
  }
});

test('identificadores inseguros sao recusados antes de chamar Google', async () => {
  const { client, requests } = fixture({});
  for (const unsafe of ['https://evil.example/abc', '../secrets', 'curto', 'a'.repeat(201)]) {
    await assert.rejects(() => client.abas('token', unsafe));
    await assert.rejects(() => client.ler('token', unsafe, 'Aba'));
  }
  assert.equal(requests.length, 0);
});

test('metadados incluem tamanho da aba para detectar limite de colunas', async () => {
  const { client, requests } = fixture({spreadsheetId:id,properties:{title:'Pacientes'},sheets:[{properties:{sheetId:1,title:'Lista',gridProperties:{rowCount:5000,columnCount:70}}}]});
  assert.deepEqual(await client.abas('token',id), {titulo:'Pacientes',abas:[{id:1,titulo:'Lista',linhas:5000,colunas:70}]});
  assert.equal(requests[0].url.origin, 'https://sheets.googleapis.com');
  assert.equal(requests[0].url.searchParams.get('fields'), 'spreadsheetId,properties.title,sheets.properties');
  assert.equal(new Headers(requests[0].init?.headers).get('Authorization'), 'Bearer token');
});

test('leitura escapa nome da aba e pede valores formatados dentro do limite', async () => {
  const { client, requests } = fixture({values:[['CPF'],['00123456789']]});
  assert.deepEqual(await client.ler('token',id,"D'Água / principal"), {valores:[['CPF'],['00123456789']],limitado:false});
  assert.equal(decodeURIComponent(requests[0].url.pathname), `/v4/spreadsheets/${id}/values/'D''Água / principal'!A1:AZ1001`);
  assert.equal(requests[0].url.searchParams.get('valueRenderOption'), 'FORMATTED_VALUE');
});

test('1001 linhas marcam leitura limitada; corta respostas acima dos limites', async () => {
  const { client } = fixture({values:Array.from({length:1002}, () => Array.from({length:53}, () => 'x'))});
  const result = await client.ler('token',id,'Lista');
  assert.equal(result.limitado,true); assert.equal(result.valores.length,1001); assert.equal(result.valores[0].length,52);
});

test('limite atingido nao afirma completude e valores numericos nao ganham zeros', async () => {
  assert.equal((await fixture({values:Array.from({length:1001}, () => ['x'])}).client.ler('token',id,'Lista')).limitado, true);
  assert.equal((await fixture({values:Array.from({length:1000}, () => ['x'])}).client.ler('token',id,'Lista')).limitado, false);
  assert.deepEqual((await fixture({values:[[123456789]]}).client.ler('token',id,'Lista')).valores, [['123456789']]);
});

test('resposta HTTP diferente de 200 e estrutura invalida sao rejeitadas', async () => {
  await assert.rejects(() => fixture({access_token:'x',expires_in:60},201).client.renovar('token'));
  await assert.rejects(() => fixture({values:['linha-invalida']}).client.ler('token',id,'Lista'));
  await assert.rejects(() => fixture({sheets:[{properties:{title:'Lista'}}],properties:{title:'Planilha'}}).client.abas('token',id));
});

test('planilha vazia retorna valores vazios', async () => {
  assert.deepEqual(await fixture({}).client.ler('token',id,'Lista'), {valores:[],limitado:false});
});

test('revogacao usa endpoint fixo e token no corpo', async () => {
  const { client, requests } = fixture({});
  await client.revogar('token-secreto');
  assert.equal(requests[0].url.href,'https://oauth2.googleapis.com/revoke');
  assert.equal(new URLSearchParams(String(requests[0].init?.body)).get('token'),'token-secreto');
});

test('falhas de rede sao sanitizadas', async () => {
  const client = new GooglePlanilhasClient({...config,fetch:async () => {throw new Error('Bearer segredo');}});
  await assert.rejects(() => client.ler('token',id,'Lista'), error => error instanceof Error && !error.message.includes('segredo'));
});
