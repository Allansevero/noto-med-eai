/** Exercita a consulta do cadastro sem APIs pagas nem acesso a banco. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleConsultaRegistro } from './google-registro.js';
import { enriquecerCadastro } from './enriquecer-cadastro.js';
import { montarRevisao } from './revisao-painel.js';

const nome = 'BRUNA BOTTER';
const fonte = { title: 'Dra. Bruna Botter', snippet: 'CRM SC 30858 RQE SC 21234', link: 'https://medicos.example/perfil' };
const evidencia = { fonte: 0, trechos: [fonte.title, fonte.snippet] };
const base = { nomeCompleto: nome, crm: '30858', uf: 'SC', evidenciaCrm: evidencia };

test('diagnóstico diferencia RQE omitido pelo modelo de RQE rejeitado pela validação', async () => {
  for (const [rqes, motivo] of [
    [[], 'NVIDIA_SEM_CANDIDATOS_RQE'],
    [[{ numero: 21234, evidencia }], 'RQE_NUMERO_TIPO_INVALIDO'],
    [[{ numero: '21234', uf: 'PR', evidencia }], 'RQE_UF_DIVERGENTE'],
    [[{ numero: '21234', evidencia: { fonte: 9, trecho: fonte.snippet } }], 'EVIDENCIA_RQE_FONTE_INEXISTENTE'],
    [[{ numero: '21234', evidencia: { fonte: 0, trecho: fonte.snippet } }], 'NOME_AUSENTE_CITACAO_RQE'],
    [[{ numero: '99999', evidencia }], 'RQE_AUSENTE_FONTE'],
    [[{ numero: '21234', evidencia }], 'ACEITO']
  ] as Array<[unknown[], string]>) {
    const diagnostico: Array<{ etapa: string; motivo?: string; fontesComNomeCrmERqe?: number }> = [];
    let chamadas = 0, extracoes = 0;
    const cliente = new GoogleConsultaRegistro({ serperApiKey: 'fixture-secreta', nvidiaApiKey: 'fixture-secreta',
      diagnosticar: e => diagnostico.push(e),
      requisitar: (async () => { chamadas++; return Response.json({ organic: [fonte] }); }) as typeof fetch,
      completar: async () => { extracoes++;return JSON.stringify({ registros: [{ ...base, rqes }] }); }
    });
    const resultado = await cliente.buscar(nome);
    assert.equal(resultado.estado, 'consultado');
    if (resultado.estado !== 'consultado') continue;
    assert.equal(resultado.dados[0].rqe, motivo === 'ACEITO' ? '21234' : null);
    assert.ok(diagnostico.some(e => e.etapa === 'validacao_rqe' && e.motivo === motivo), motivo);
    assert.equal(diagnostico.find(e => e.etapa === 'fontes_rqe')?.fontesComNomeCrmERqe, 1);
    assert.equal(chamadas, 1);assert.equal(extracoes, 1);
    assert.doesNotMatch(JSON.stringify(diagnostico), /BRUNA|Botter|30858|21234|medicos|secreta/);
  }
});

test('cadastro novo conserva diagnóstico da consulta real até a revisão sem repetir pesquisa', async () => {
  let consultas = 0;
  const cliente = new GoogleConsultaRegistro({ serperApiKey: 'fixture', nvidiaApiKey: 'fixture', incluirDiagnostico: true,
    requisitar: (async () => { consultas++; return Response.json({ organic: [fonte] }); }) as typeof fetch,
    completar: async () => JSON.stringify({ registros: [{ ...base, rqes: [] }] })
  });
  const empresa = { consultar: async () => ({ estado: 'consultado' as const, dados: { cnpj: '11222333000181', razaoSocial: 'Clínica', origem: 'Hub', candidatos: [{ nome, origem: 'Hub' }] } }) };
  const entrada = { documento: '11222333000181', perfil: { nome: 'Médico X', crm: null, nomeConfirmado: false }, dados: {} };
  const cadastro = await enriquecerCadastro(entrada, empresa, cliente);
  const repetido = await enriquecerCadastro({ ...entrada, dados: { ...cadastro.dados, nomeConfirmado: nome } }, empresa, cliente);
  const revisao = montarRevisao({ id: 'teste', estado: repetido.estado, dados: repetido.dados }, { nome, crm: null, rqe: null });
  assert.equal(revisao.crm, '30858/SC');assert.equal(revisao.rqe, '');assert.equal(consultas, 1);
  assert.ok(Array.isArray(revisao.diagnosticoPesquisa));
  assert.ok(revisao.diagnosticoPesquisa.some(e => e.etapa === 'validacao_rqe' && e.motivo === 'NVIDIA_SEM_CANDIDATOS_RQE'));
  assert.deepEqual(revisao.diagnosticoPesquisa, cadastro.dados.pesquisaProfissional?.diagnostico);
});
