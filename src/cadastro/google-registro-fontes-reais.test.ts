import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleConsultaRegistro, validarExtracaoGoogle } from './google-registro.js';

// Resultados fornecidos pelo usuário, sem a credencial ou novas consultas externas.
const organic = [
  { title: 'Psiquiatra Psicodinâmica (@brunabotterpsiquiatra)', link: 'https://www.instagram.com/brunabotterpsiquiatra/',
    snippet: 'CRM/SC 30858 • RQE 21234 | Psiquiatra | Psicoterapeuta psicanalítica | Preceptora residência de psiquiatria PMFlorianópolis | Para agendamentos ⤵️.' },
  { title: 'Dra. Bruna Botter — Psiquiatra em Florianópolis - Ache Clínicas', link: 'https://acheclinicas.com.br/profissional/dra-bruna-botter',
    snippet: 'Bruna Botter. Psiquiatra · CRM-SC 30858. Sem avaliações ainda. Florianópolis ... CRM-SC 30858. Locais de atendimento. Psiquiatria e Psicoterapia de ...' },
  { title: 'Bruna Botter: Psiquiatra em São José - SC', link: 'https://www.boaconsulta.com/especialista/bruna-botter-61062bbfa2e00a12a9001213',
    snippet: 'Especialista Psiquiatra Bruna Botter ✓ Agende sua Consulta ✓ Colonia ... Bruna Botter. Psiquiatria. CRM 30858 SC. Compartilhar Gostou desse profissional ...' },
  { title: 'Bruna Botter - CRM/SC 30858 | Psiquiatra - Bula.com.br', link: 'https://bula.com.br/medico/bruna-botter-crm-sc-30858',
    snippet: 'Bruna Botter · CRM/SC 30858 · Psiquiatra · Florianópolis/SC. Onde atende, endereço e telefone, segundo o CNES/DataSUS.' }
];
const fontes = organic.map((r, indice) => ({ indice, titulo: r.title, trecho: r.snippet, url: r.link }));

test('consulta igual à pesquisa fornecida e aceita os formatos reais de CRM sem atribuir RQE por handle', async () => {
  let pesquisas = 0;
  const cliente = new GoogleConsultaRegistro({ serperApiKey: 'fixture', nvidiaApiKey: 'fixture',
    requisitar: (async (_url, init) => {
      pesquisas++;assert.deepEqual(JSON.parse(String(init?.body)), { q: 'CRM Bruna Botter', gl: 'br', hl: 'pt-br' });
      return Response.json({ organic });
    }) as typeof fetch,
    completar: async () => JSON.stringify({ registros: [1, 2, 3].map(fonte => ({ nomeCompleto: 'Bruna Botter', crm: '30858', uf: 'SC',
      evidenciaCrm: { fonte, trecho: organic[fonte].snippet },
      rqes: [{ numero: '21234', evidencia: { fonte: 0, trecho: organic[0].snippet } }]
    })) })
  });
  const resultado = await cliente.buscar('Bruna Botter');
  assert.equal(pesquisas, 1);assert.equal(resultado.estado, 'consultado');
  if (resultado.estado !== 'consultado') return;
  assert.equal(resultado.dados.length, 1);assert.equal(resultado.dados[0].crm, '30858');assert.equal(resultado.dados[0].uf, 'SC');
  assert.equal(resultado.dados[0].verificado, false);assert.deepEqual(resultado.dados[0].rqes, []);
});

test('CRM 30858 SC é inscrição explícita e não UF inferida do endereço', () => {
  const r = { nomeCompleto: 'Bruna Botter', crm: '30858', uf: 'SC', evidenciaCrm: { fonte: 2, trecho: organic[2].snippet } };
  assert.equal(validarExtracaoGoogle('Bruna Botter', fontes, JSON.stringify({ registros: [r] }))?.[0].crm, '30858');
  const endereco = fontes.map(f => f.indice === 2 ? { ...f, trecho: 'Bruna Botter. CRM 30858. Endereço: Florianópolis SC.' } : f);
  assert.deepEqual(validarExtracaoGoogle('Bruna Botter', endereco, JSON.stringify({ registros: [{ ...r, evidenciaCrm: { fonte: 2, trecho: endereco[2].trecho } }] })), []);
});

test('nome no título e CRM/RQE no snippet da mesma fonte podem ser citados separadamente', () => {
  const fonte = { indice: 0, titulo: 'Dra. Bruna Botter — Psiquiatra', trecho: 'CRM/SC 30858 • RQE 21234.', url: 'https://clinica.example/perfil' };
  const evidencia = { fonte: 0, trechos: [fonte.titulo, fonte.trecho] };
  const r = { nomeCompleto: 'Bruna Botter', crm: '30858', uf: 'SC', evidenciaCrm: evidencia, rqes: [{ numero: '21234', evidencia }] };
  const resultado = validarExtracaoGoogle('Bruna Botter', [fonte], JSON.stringify({ registros: [r] }));
  assert.equal(resultado?.[0].crm, '30858');assert.equal(resultado?.[0].rqe, '21234');assert.equal(resultado?.[0].fontesRqe?.[0].uf, 'SC');
  assert.equal(resultado?.[0].fontesRqe?.[0].ufOrigem, 'crm');
  const divergente = { ...fonte, trecho: 'CRM/SC 30858 • RQE/PR 21234.' };
  const outro = { ...r, evidenciaCrm: { fonte: 0, trechos: [divergente.titulo, divergente.trecho] }, rqes: [{ numero: '21234', evidencia: { fonte: 0, trechos: [divergente.titulo, divergente.trecho] } }] };
  assert.deepEqual(validarExtracaoGoogle('Bruna Botter', [divergente], JSON.stringify({ registros: [outro] }))?.[0].rqes, []);
});

test('aceita UF após número e rejeita UF divergente ou número incompleto em todos os formatos', () => {
  for (const crm of ['CRM 30858/SC', 'CRM 30858-SC', 'CRM 30.858 SC']) {
    for (const rqe of ['RQE 21234/SC', 'RQE 21234 SC', 'RQE-SC 21234', 'RQE 21234']) {
      const fonte = { indice: 0, titulo: 'Bruna Botter', trecho: `${crm} · ${rqe}.`, url: 'https://clinica.example/perfil' };
      const evidencia = { fonte: 0, trechos: [fonte.titulo, fonte.trecho] };
      const r = { nomeCompleto: 'Bruna Botter', crm: '30858', uf: 'SC', evidenciaCrm: evidencia, rqes: [{ numero: '21234', evidencia }] };
      assert.equal(validarExtracaoGoogle('Bruna Botter', [fonte], JSON.stringify({ registros: [r] }))?.[0].rqe, '21234', `${crm} · ${rqe}`);
    }
  }
  for (const texto of ['CRM 30858 SC · RQE 21234/PR.', 'CRM 30858 SC · RQE 21234 PR.', 'CRM 30858 SC · RQE 212345.']) {
    const fonte = { indice: 0, titulo: 'Bruna Botter', trecho: texto, url: 'https://clinica.example/perfil' };
    const evidencia = { fonte: 0, trechos: [fonte.titulo, fonte.trecho] };
    const r = { nomeCompleto: 'Bruna Botter', crm: '30858', uf: 'SC', evidenciaCrm: evidencia, rqes: [{ numero: '21234', evidencia }] };
    assert.deepEqual(validarExtracaoGoogle('Bruna Botter', [fonte], JSON.stringify({ registros: [r] }))?.[0].rqes, [], texto);
  }
});

test('fragmentos de outra fonte ou de veja também não identificam o titular', () => {
  const fonte = { indice: 0, titulo: 'Dra. Bruna Botter', trecho: 'Veja também: Carla Lima, CRM 30858 SC · RQE 21234.', url: 'https://clinica.example/perfil' };
  const evidencia = { fonte: 0, trechos: [fonte.titulo, fonte.trecho] };
  const r = { nomeCompleto: 'Bruna Botter', crm: '30858', uf: 'SC', evidenciaCrm: evidencia };
  assert.deepEqual(validarExtracaoGoogle('Bruna Botter', [fonte], JSON.stringify({ registros: [r] })), []);
  assert.deepEqual(validarExtracaoGoogle('Bruna Botter', fontes, JSON.stringify({ registros: [{ ...r, evidenciaCrm: { fonte: 3, trechos: [organic[3].title, organic[0].snippet] } }] })), []);
});

test('extração com candidato sem evidência retorna diagnóstico próprio, sem declarar busca vazia', async () => {
  const cliente = new GoogleConsultaRegistro({ serperApiKey: 'fixture', nvidiaApiKey: 'fixture',
    requisitar: (async () => Response.json({ organic })) as typeof fetch,
    completar: async () => JSON.stringify({ registros: [{ nomeCompleto: 'Bruna Botter', crm: '99999', uf: 'SC', evidenciaCrm: { fonte: 3, trecho: organic[3].snippet } }] })
  });
  assert.deepEqual(await cliente.buscar('Bruna Botter'), { estado: 'nao_encontrado', codigo: 'CRM_EVIDENCIA_NAO_CONFIRMADA' });
});

test('citação parcial não pode truncar RQE nem esconder UF divergente do texto original', () => {
  for (const texto of ['CRM/SC 30858 · RQE 212345.', 'CRM/SC 30858 · RQE 21234/PR.']) {
    const fonte = { indice: 0, titulo: 'Bruna Botter', trecho: texto, url: 'https://clinica.example/perfil' };
    const r = { nomeCompleto: 'Bruna Botter', crm: '30858', uf: 'SC',
      evidenciaCrm: { fonte: 0, trechos: [fonte.titulo, 'CRM/SC 30858'] },
      rqes: [{ numero: '21234', evidencia: { fonte: 0, trechos: [fonte.titulo, 'CRM/SC 30858', 'RQE 21234'] } }]
    };
    assert.deepEqual(validarExtracaoGoogle('Bruna Botter', [fonte], JSON.stringify({ registros: [r] }))?.[0].rqes, [], texto);
  }
});
