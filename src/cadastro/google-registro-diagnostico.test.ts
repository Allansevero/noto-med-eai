import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GoogleConsultaRegistro } from './google-registro.js';

const fonte = { title: 'Bruna Botter', snippet: 'Bruna Botter CRM/SC 30858.', link: 'https://clinica.example/perfil' };
const registro = { nomeCompleto: 'Bruna Botter', crm: '30858', uf: 'SC', evidenciaCrm: { fonte: 0, trechos: [fonte.title, fonte.snippet] } };

test('diagnóstico distingue a regra que rejeitou a extração sem publicar dados do modelo', async () => {
  for (const [alteracao, motivo] of [
    [{ nomeCompleto: 'Dra. Bruna Botter' }, 'NOME_DIVERGENTE'],
    [{ crm: 30858 }, 'CRM_UF_TIPO_INVALIDO'],
    [{ evidenciaCrm: undefined }, 'EVIDENCIA_CRM_FORMATO_INVALIDO'],
    [{ evidenciaCrm: { fonte: '0', trecho: fonte.snippet } }, 'EVIDENCIA_CRM_FONTE_TIPO_INVALIDO'],
    [{ evidenciaCrm: { fonte: 1, trecho: fonte.snippet } }, 'EVIDENCIA_CRM_FONTE_INEXISTENTE'],
    [{ evidenciaCrm: { fonte: 0, trecho: 'Bruna Botter, CRM/SC 30858' } }, 'EVIDENCIA_CRM_CITACAO_NAO_LITERAL'],
    [{ evidenciaCrm: { fonte: 0, trecho: 'CRM/SC 30858' } }, 'NOME_AUSENTE_CITACAO'],
    [{ crm: '99999' }, 'CRM_FONTE_DIVERGENTE']
  ] as Array<[Record<string, unknown>, string]>) {
    const diagnosticos: unknown[] = [];
    let pesquisas = 0, extracoes = 0;
    const cliente = new GoogleConsultaRegistro({ serperApiKey: 'chave-serper-secreta', nvidiaApiKey: 'chave-nvidia-secreta',
      diagnosticar: evento => diagnosticos.push(evento),
      requisitar: (async () => { pesquisas++; return Response.json({ organic: [fonte] }); }) as typeof fetch,
      completar: async () => { extracoes++; return JSON.stringify({ registros: [{ ...registro, ...alteracao, desconhecido: 'payload-secreto' }] }); }
    });
    assert.deepEqual(await cliente.buscar('Bruna Botter'), { estado: 'nao_encontrado', codigo: 'CRM_EVIDENCIA_NAO_CONFIRMADA' });
    assert.deepEqual(diagnosticos, [{ etapa: 'serper', resultados: 1, fontesUtilizaveis: 1, fontesComMencaoRqe: 0 }, { etapa: 'nvidia', candidatos: 1 }, { etapa: 'validacao_crm', candidato: 0, motivo }]);
    assert.equal(pesquisas, 1);assert.equal(extracoes, 1);
    assert.doesNotMatch(JSON.stringify(diagnosticos), /Bruna|Botter|30858|clinica|secreta|secreto/);
  }
});

test('diagnóstico de sucesso informa contagens e não altera a validação', async () => {
  const diagnosticos: unknown[] = [];
  const cliente = new GoogleConsultaRegistro({ serperApiKey: 'fixture', nvidiaApiKey: 'fixture', diagnosticar: evento => diagnosticos.push(evento),
    requisitar: (async () => Response.json({ organic: [fonte] })) as typeof fetch,
    completar: async () => JSON.stringify({ registros: [registro] })
  });
  assert.equal((await cliente.buscar('Bruna Botter')).estado, 'consultado');
  assert.deepEqual(diagnosticos, [{ etapa: 'serper', resultados: 1, fontesUtilizaveis: 1, fontesComMencaoRqe: 0 }, { etapa: 'nvidia', candidatos: 1 }, { etapa: 'fontes_rqe', candidato: 0, fontesComNomeECrm: 1, fontesComNomeCrmERqe: 0 }, { etapa: 'nvidia_rqe', candidato: 0, candidatos: 0 }, { etapa: 'validacao_rqe', candidato: 0, motivo: 'NVIDIA_SEM_CANDIDATOS_RQE' }, { etapa: 'validacao_crm', candidato: 0, motivo: 'ACEITO' }]);
});
