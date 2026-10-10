import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarConfig } from '../config.js';

test('composição de IA usa NVIDIA em todos os fluxos mesmo quando há chave Groq', async t => {
  const modulo = await import('./criar-servicos-ia.js').catch(() => null);
  assert.ok(modulo, 'A composição exclusiva NVIDIA ainda não está disponível');
  const cfg = carregarConfig({ NVIDIA_API_KEY: 'nvidia-teste', NVIDIA_MODEL: 'modelo-nvidia', GROQ_API_KEY: 'groq-nao-usar' });
  const servicos = modulo.criarServicosIa(cfg);
  const respostas = [{ mensagens: ['Como posso ajudar?'] }, { valor_reais: 20 },
    { acao: 'escalar', causa: 'x', justificativa: 'x', acaoNecessaria: 'x' },
    { ferramentaId: null }, { nome: 0, cpf: null, email: null, telefone: 1 }];
  let chamadas = 0;
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    assert.equal(url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer nvidia-teste');
    assert.equal(JSON.parse(String(init?.body)).model, 'modelo-nvidia');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(respostas[chamadas++]) } }] });
  });
  assert.deepEqual(await servicos.geradorMensagem.gerar({ evento: 'conversa', destinatario: 'medico', medico: { nome: null, crm: null, rqe: null }, caso: null,
    quantidadeNotasParadas: 0, mensagemRecebida: 'Oi', dados: {}, historico: [] }), ['Como posso ajudar?']);
  assert.equal((await servicos.extrator.extrairDados('texto')).valorConsultaCentavos, 2000);
  assert.equal((await servicos.decisorFiscal.decidir({})).acao, 'escalar');
  assert.equal(await servicos.decisorTribemd.decidir({ ferramentas: [], passo: 1, pacientes: 0, agendamentos: 0 }), null);
  assert.deepEqual(await servicos.mapeadorPlanilhas!.mapear(['Nome', 'Telefone']), { nome: 0, cpf: null, email: null, telefone: 1 });
  assert.equal(chamadas, 5);
});

test('composição não usa Groq quando NVIDIA está ausente', async t => {
  const modulo = await import('./criar-servicos-ia.js').catch(() => null);
  assert.ok(modulo, 'A composição exclusiva NVIDIA ainda não está disponível');
  let chamadas = 0; t.mock.method(globalThis, 'fetch', async () => { chamadas++; return Response.json({}); });
  const servicos = modulo.criarServicosIa(carregarConfig({ GROQ_API_KEY: 'groq-nao-usar' }));
  assert.equal(servicos.mapeadorPlanilhas, undefined);
  assert.deepEqual(await servicos.extrator.extrairDados('texto'), {});
  await assert.rejects(servicos.decisorFiscal.decidir({}));
  assert.equal(chamadas, 0);
});
