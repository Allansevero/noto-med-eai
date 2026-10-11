import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleConsultaRegistro, validarExtracaoGoogle } from './google-registro.js';

const nome = 'Bruna Botter';
const fonte = {
  indice: 0,
  titulo: 'Bruna Botter — CRM-SC 30858',
  trecho: 'Bruna Botter CRM-SC 30858; RQE-SC 21234.',
  url: 'https://medicos.example/perfil/bruna-botter'
};
const registro = (overrides: Record<string, unknown> = {}) => ({
  nomeCompleto: nome,
  crm: '30858',
  uf: 'SC',
  evidenciaCrm: { fonte: 0, trecho: 'Bruna Botter CRM-SC 30858' },
  rqes: [{ numero: '21234', uf: 'SC', evidencia: { fonte: 0, trecho: 'Bruna Botter CRM-SC 30858; RQE-SC 21234' } }],
  ...overrides
});
const fontes = [fonte];

test('aceita JSON em bloco Markdown sem dispensar validação de evidência', () => {
  const json = JSON.stringify({ registros: [registro()] });
  for (const inicio of ['```json', '```']) {
    assert.equal(validarExtracaoGoogle(nome, fontes, `${inicio}\n${json}\n\x60\x60\x60`)?.[0].crm, '30858');
  }
  const inventado = JSON.stringify({ registros: [registro({ crm: '99999' })] });
  assert.deepEqual(validarExtracaoGoogle(nome, fontes, `\x60\x60\x60json\n${inventado}\n\x60\x60\x60`), []);
  assert.equal(validarExtracaoGoogle(nome, fontes, `Explicação adicional\n\x60\x60\x60json\n${json}\n\x60\x60\x60`), null);
});

test('distingue falhas de JSON, estrutura e limite sem expor conteúdo nem repetir APIs', async () => {
  for (const [resposta, codigo] of [
    ['conteúdo secreto sem JSON', 'NVIDIA_JSON_INVALIDO'],
    ['{}', 'NVIDIA_FORMATO_INESPERADO'],
    ['{"registros":null}', 'NVIDIA_FORMATO_INESPERADO'],
    [JSON.stringify({ registros: Array(21).fill({}) }), 'NVIDIA_LIMITE_EXCEDIDO'],
    [' '.repeat(32_769), 'NVIDIA_LIMITE_EXCEDIDO']
  ]) {
    let pesquisas = 0, extracoes = 0;
    const cliente = new GoogleConsultaRegistro({ serperApiKey: 'x', nvidiaApiKey: 'y',
      requisitar: (async () => { pesquisas++; return Response.json({ organic: [{ title: fonte.titulo, snippet: fonte.trecho, link: fonte.url }] }); }) as typeof fetch,
      completar: async () => { extracoes++; return resposta; }
    });
    assert.deepEqual(await cliente.buscar(nome), { estado: 'indisponivel', codigo });
    assert.equal(pesquisas, 1);assert.equal(extracoes, 1);
  }
});

test('aceita somente CRM e RQE literais ligados ao mesmo nome, registro e fonte', () => {
  const resultado = validarExtracaoGoogle(nome, fontes, JSON.stringify({ registros: [registro()] }));
  assert.equal(resultado?.length, 1);
  assert.equal(resultado?.[0].nomeCompleto, nome);
  assert.equal(resultado?.[0].crm, '30858');
  assert.equal(resultado?.[0].uf, 'SC');
  assert.equal(resultado?.[0].verificado, false);
  assert.deepEqual(resultado?.[0].rqes, ['21234']);
  assert.equal(resultado?.[0].fontesRqe?.[0].urlOrigem, fonte.url);
});

test('rejeita CRM inventado, número truncado e UF que não aparece junto ao CRM', () => {
  assert.deepEqual(validarExtracaoGoogle(nome, fontes, JSON.stringify({ registros: [registro({ crm: '99999' })] })), []);
  assert.deepEqual(validarExtracaoGoogle(nome, [{ ...fonte, trecho: 'Bruna Botter CRM-SC 308589; RQE-SC 21234.' }], JSON.stringify({ registros: [registro()] })), []);
  assert.deepEqual(validarExtracaoGoogle(nome, [{ ...fonte, trecho: 'Bruna Botter CRM-PR 30858; RQE-SC 21234.' }], JSON.stringify({ registros: [registro()] })), []);
});

test('não deduz UF do endereço ou cidade e recusa RQE de UF divergente', () => {
  const semUf = [{ ...fonte, trecho: 'Bruna Botter, médica em Florianópolis, CRM 30858.' }];
  assert.deepEqual(validarExtracaoGoogle(nome, semUf, JSON.stringify({ registros: [registro()] })), []);
  const rqeOutraUf = registro({ rqes: [{ numero: '21234', uf: 'PR', evidencia: { fonte: 0, trecho: 'Bruna Botter CRM-SC 30858; RQE-PR 21234' } }] });
  const resultado = validarExtracaoGoogle(nome, fontes, JSON.stringify({ registros: [rqeOutraUf] }));
  assert.equal(resultado?.[0].crm, '30858');
  assert.deepEqual(resultado?.[0].rqes, []);
});

test('preserva vários CRMs e não escolhe o primeiro; fontes com vários registros são ambíguas', () => {
  const segundo = { ...fonte, indice: 1, titulo: 'Bruna Botter — perfil profissional', trecho: 'Bruna Botter CRM-PR 36584.', url: 'https://medicos.example/outro-perfil' };
  const saida = validarExtracaoGoogle(nome, [fonte, segundo], JSON.stringify({ registros: [registro(), registro({ crm: '36584', uf: 'PR', evidenciaCrm: { fonte: 1, trecho: 'Bruna Botter CRM-PR 36584' }, rqes: [] })] }));
  assert.deepEqual(saida?.map(r => `${r.crm}/${r.uf}`), ['30858/SC', '36584/PR']);
  const ambigua = [{ ...fonte, trecho: 'Bruna Botter CRM-SC 30858. Bruna Botter CRM-PR 36584.' }];
  assert.deepEqual(validarExtracaoGoogle(nome, ambigua, JSON.stringify({ registros: [registro()] })), []);
});

test('não vincula RQE em menção “veja também” a outro perfil e rejeita registros inativos', () => {
  const vejaTambem = registro({ rqes: [{ numero: '21234', uf: 'SC', evidencia: { fonte: 0, trecho: 'Veja também RQE-SC 21234' } }] });
  const resultado = validarExtracaoGoogle(nome, fontes, JSON.stringify({ registros: [vejaTambem] }));
  assert.deepEqual(resultado?.[0].rqes, []);
  const transferida = [{ ...fonte, trecho: 'Bruna Botter CRM-PR 36584 — situação: Transferido.' }];
  assert.deepEqual(validarExtracaoGoogle(nome, transferida, JSON.stringify({ registros: [registro({ crm: '36584', uf: 'PR', evidenciaCrm: { fonte: 0, trecho: 'Bruna Botter CRM-PR 36584' }, rqes: [] })] })), []);
});

test('preserva vários RQEs e as respectivas URLs, sem marcar nenhum como verificado', () => {
  const segundaFonte = { indice: 1, titulo: 'Bruna Botter — especialista', trecho: 'Bruna Botter CRM-SC 30858; RQE-SC 44556.', url: 'https://hospital.example/bruna' };
  const resposta = { registros: [registro({ evidenciaCrm: { fonte: 1, trecho: 'Bruna Botter CRM-SC 30858' }, rqes: [
    { numero: '21234', uf: 'SC', evidencia: { fonte: 0, trecho: 'Bruna Botter CRM-SC 30858; RQE-SC 21234' } },
    { numero: '44556', uf: 'SC', evidencia: { fonte: 1, trecho: 'Bruna Botter CRM-SC 30858; RQE-SC 44556' } }
  ] })] };
  const resultado = validarExtracaoGoogle(nome, [fonte, segundaFonte], JSON.stringify(resposta));
  assert.equal(resultado?.[0].rqe, null);
  assert.deepEqual(resultado?.[0].rqes, ['21234', '44556']);
  assert.deepEqual(resultado?.[0].fontesRqe?.map(r => r.urlOrigem), [fonte.url, segundaFonte.url]);
  assert.equal(resultado?.[0].verificado, false);
});

test('consulta Serper com o contrato exigido e passa resultados orgânicos à NVIDIA', async () => {
  let requisicao: { url: string; init?: RequestInit } | undefined;
  let mensagens: unknown;
  const cliente = new GoogleConsultaRegistro({
    serperApiKey: 'serper-fixture', nvidiaApiKey: 'nvidia-fixture', modelo: 'modelo-fixture',
    requisitar: (async (input, init) => {
      requisicao = { url: String(input), init };
      return Response.json({ organic: [{ title: fonte.titulo, snippet: fonte.trecho, link: fonte.url }] });
    }) as typeof fetch,
    completar: async (msgs) => { mensagens = msgs; return `\x60\x60\x60json\n${JSON.stringify({ registros: [registro()] })}\n\x60\x60\x60`; }
  });
  const resultado = await cliente.buscar(nome);
  assert.equal(resultado.estado, 'consultado');
  assert.equal(requisicao?.url, 'https://google.serper.dev/search');
  assert.equal(requisicao?.init?.method, 'POST');
  const headers = new Headers(requisicao?.init?.headers);
  assert.equal(headers.get('X-API-KEY'), 'serper-fixture');
  assert.equal(headers.get('Content-Type'), 'application/json');
  assert.deepEqual(JSON.parse(String(requisicao?.init?.body)), { q: 'CRM Bruna Botter', gl: 'br', hl: 'pt-br', num: 10 });
  assert.match(JSON.stringify(mensagens), /não confiável/iu);
});

test('JSON com registros vazios é ausência de evidência, não falha de formato', async () => {
  const cliente = new GoogleConsultaRegistro({ serperApiKey: 'x', nvidiaApiKey: 'y',
    requisitar: (async () => Response.json({ organic: [{ title: fonte.titulo, snippet: fonte.trecho, link: fonte.url }] })) as typeof fetch,
    completar: async () => '{"registros":[]}'
  });
  assert.deepEqual(await cliente.buscar(nome), { estado: 'nao_encontrado', codigo: 'NVIDIA_SEM_REGISTROS' });
});

test('sem credenciais, resultado vazio e falhas externas são sanitizados e não repetem pesquisas', async () => {
  let chamadas = 0;
  const semCredenciais = new GoogleConsultaRegistro({ requisitar: (async () => { chamadas++; throw Error('segredo'); }) as typeof fetch });
  assert.deepEqual(await semCredenciais.buscar(nome), { estado: 'indisponivel', codigo: 'CRM_FONTE_NAO_CONFIGURADA' });
  assert.equal(chamadas, 0);
  const vazio = new GoogleConsultaRegistro({ serperApiKey: 'x', nvidiaApiKey: 'y', requisitar: (async () => Response.json({ organic: [] })) as typeof fetch });
  assert.deepEqual(await vazio.buscar(nome), { estado: 'nao_encontrado', codigo: 'SERPER_SEM_RESULTADOS_UTILIZAVEIS' });
  const falha = new GoogleConsultaRegistro({ serperApiKey: 'x', nvidiaApiKey: 'y', requisitar: (async () => { chamadas++; throw Error('token secreto e payload bruto'); }) as typeof fetch });
  const erro = await falha.buscar(nome);
  assert.deepEqual(erro, { estado: 'indisponivel', codigo: 'SERPER_CONSULTA_INDISPONIVEL' });
  assert.equal(chamadas, 1);
  assert.equal(JSON.stringify(erro).includes('secreto'), false);
});
