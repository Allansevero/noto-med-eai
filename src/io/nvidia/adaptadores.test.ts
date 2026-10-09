import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { ContextoMensagemNoto } from '../../conversa/comunicador-noto.js';
import { ErroNvidiaChat } from './chat-client.js';

async function adaptadores() {
  const modulo = await import('./adaptadores.js').catch(() => null);
  assert.ok(modulo, 'Os adaptadores NVIDIA ainda não estão disponíveis');
  return modulo;
}
const contexto: ContextoMensagemNoto = {
  evento: 'conversa', destinatario: 'medico', medico: { nome: null, crm: null, rqe: null },
  caso: null, quantidadeNotasParadas: 0, mensagemRecebida: 'Qual dado falta?', dados: {}, historico: []
};
const resposta = (content: unknown, finish_reason = 'stop') => Response.json({ choices: [{
  finish_reason, message: { content: typeof content === 'string' ? content : JSON.stringify(content) }
}] });

test('NVIDIA mantém o guia e limites da conversa e devolve mensagens validadas', async t => {
  const { NvidiaGeradorMensagemNoto } = await adaptadores();
  let body: any;
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    assert.equal(url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer chave-teste');
    assert.equal(init?.redirect, 'error'); assert.ok(init?.signal);
    body = JSON.parse(String(init?.body));
    return resposta({ mensagens: ['Qual CRM você usa?'] });
  });
  assert.deepEqual(await new NvidiaGeradorMensagemNoto('chave-teste', 'moonshotai/kimi-k3').gerar(contexto), ['Qual CRM você usa?']);
  const guia = await readFile(new URL('../../../docs/prompts/noto-conversa.md', import.meta.url), 'utf8');
  assert.ok(body.messages[0].content.includes(guia));
  assert.match(body.messages[0].content, /Não peça "pode emitir"/);
  assert.deepEqual(JSON.parse(body.messages[1].content), contexto);
  assert.equal(body.model, 'moonshotai/kimi-k3'); assert.equal(body.stream, false);
});

test('NVIDIA rejeita mensagens e decisões inválidas ou incompletas', async t => {
  const { NvidiaGeradorMensagemNoto, NvidiaDecisorFiscal } = await adaptadores();
  const fake = t.mock.method(globalThis, 'fetch', async () => resposta({ mensagens: ['ok'] }));
  for (const content of ['não é JSON', { mensagens: [] }, { mensagens: ['ok'], emitir: true }, { mensagens: ['x'.repeat(501)] }]) {
    fake.mock.mockImplementation(async () => resposta(content));
    await assert.rejects(new NvidiaGeradorMensagemNoto('chave', 'modelo').gerar(contexto));
  }
  fake.mock.mockImplementation(async () => resposta({ mensagens: ['ok'] }, 'length'));
  await assert.rejects(new NvidiaGeradorMensagemNoto('chave', 'modelo').gerar(contexto));
  fake.mock.mockImplementation(async () => resposta({ acao: 'alterar_regime', causa: 'x', justificativa: 'x', acaoNecessaria: 'x' }));
  await assert.rejects(new NvidiaDecisorFiscal('chave', 'modelo').decidir({}));
});

test('redação preserva o diagnóstico HTTP da NVIDIA sem expor resposta ou chave', async t => {
  const { NvidiaGeradorMensagemNoto } = await adaptadores();
  const fake = t.mock.method(globalThis, 'fetch', async () => new Response('corpo privado', {status:429}));
  for(const status of [429,500,503]) {
    fake.mock.mockImplementation(async()=>new Response('corpo privado',{status}));
    await assert.rejects(new NvidiaGeradorMensagemNoto('chave-privada').gerar(contexto), (erro: unknown) => {
      assert.ok(erro instanceof ErroNvidiaChat);
      assert.equal(erro.codigo,'IA_HTTP_ERRO');assert.equal(erro.statusHttp,status);
      assert.doesNotMatch(erro.message+JSON.stringify(erro),/corpo privado|chave-privada/);
      return true;
    });
  }
});

test('redação distingue falha de conexão de resposta inválida', async t => {
  const { NvidiaGeradorMensagemNoto } = await adaptadores();
  const fake = t.mock.method(globalThis,'fetch',async()=>{throw Error('endereço e credenciais privados');});
  await assert.rejects(new NvidiaGeradorMensagemNoto('chave').gerar(contexto), {codigo:'IA_CONEXAO_FALHOU'});
  for(const content of ['conteúdo privado sem JSON',{mensagens:[]},{mensagens:['x'.repeat(501)]}]) {
    fake.mock.mockImplementation(async()=>resposta(content));
    await assert.rejects(new NvidiaGeradorMensagemNoto('chave').gerar(contexto),(erro:unknown)=>{
      assert.ok(erro instanceof ErroNvidiaChat);assert.equal(erro.codigo,'IA_RESPOSTA_INVALIDA');
      assert.doesNotMatch(erro.message+JSON.stringify(erro),/conteúdo privado|xxx/);return true;
    });
  }
  await assert.rejects(new NvidiaGeradorMensagemNoto(' ').gerar(contexto),{codigo:'IA_NAO_CONFIGURADA'});
});

test('NVIDIA extrai usando o parser existente e não faz fallback para Groq', async t => {
  const { NvidiaApiClient } = await adaptadores();
  let chamadas = 0;
  const fake = t.mock.method(globalThis, 'fetch', async (url: unknown) => {
    assert.equal(url, 'https://integrate.api.nvidia.com/v1/chat/completions'); chamadas++;
    return resposta({ nome_paciente: 'Ana Teste', valor_reais: 150.25, cpf: '01234567890' });
  });
  const extrator = new NvidiaApiClient({ apiKey: 'chave', modelo: 'modelo' });
  const dados = await extrator.extrairDados('Consulta sintética', new Date('2026-10-08T12:00:00Z'));
  assert.equal(dados.nomePaciente, 'Ana Teste'); assert.equal(dados.valorConsultaCentavos, 15025);
  assert.equal(dados.cpfPaciente, '01234567890');
  fake.mock.mockImplementation(async () => { chamadas++; return new Response('SEGREDO', { status: 503 }); });
  assert.deepEqual(await extrator.extrairDados('Consulta sintética'), {});
  assert.equal(chamadas, 2);
});

test('NVIDIA preserva ferramentas fiscais restritas e não transforma erros em autorização', async t => {
  const { NvidiaDecisorFiscal } = await adaptadores();
  let body: any;
  const fake = t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return resposta({ acao: 'escalar', causa: 'Dado faltante', justificativa: 'sem evidência', acaoNecessaria: 'revisar' });
  });
  assert.equal((await new NvidiaDecisorFiscal('chave', 'modelo').decidir({ ferramentasPermitidas: ['escalar'] })).acao, 'escalar');
  assert.match(body.messages[0].content, /A aplicação verificará/);
  assert.deepEqual(JSON.parse(body.messages[1].content), { ferramentasPermitidas: ['escalar'] });
  fake.mock.mockImplementation(async () => new Response('SEGREDO-PROVEDOR', { status: 429 }));
  await assert.rejects(new NvidiaDecisorFiscal('CHAVE-PRIVADA', 'modelo').decidir({}), (e: Error) => {
    assert.doesNotMatch(e.message + JSON.stringify(e), /SEGREDO|CHAVE-PRIVADA/); return true;
  });
});

test('NVIDIA recebe apenas imagens dos controles permitidos no TribemD', async t => {
  const { NvidiaDecisorTribemd } = await adaptadores();
  let body: any;
  t.mock.method(globalThis, 'fetch', async (url: unknown, init?: RequestInit) => {
    assert.equal(url, 'https://integrate.api.nvidia.com/v1/chat/completions');
    body = JSON.parse(String(init?.body)); return resposta({ ferramentaId: 'agenda' });
  });
  const decisor = new NvidiaDecisorTribemd('chave', 'moonshotai/kimi-k3');
  assert.equal(await decisor.decidir({ ferramentas: [{ id: 'agenda', acao: 'abrir_agenda' }],
    passo: 1, pacientes: 0, agendamentos: 0,
    visao: [{ ferramentaId: 'agenda', imagemBase64: 'controle' }, { ferramentaId: 'proibida', imagemBase64: 'NAO-ENVIAR' }]
  }), 'agenda');
  assert.equal(body.model, 'moonshotai/kimi-k3');
  assert.equal(body.messages[1].content[2].image_url.url, 'data:image/png;base64,controle');
  assert.ok(!JSON.stringify(body).includes('NAO-ENVIAR'));
});

test('chave NVIDIA ausente impede chamadas externas', async t => {
  const { NvidiaGeradorMensagemNoto, NvidiaApiClient, NvidiaDecisorFiscal, NvidiaDecisorTribemd } = await adaptadores();
  let chamadas = 0; t.mock.method(globalThis, 'fetch', async () => { chamadas++; return resposta({}); });
  await assert.rejects(new NvidiaGeradorMensagemNoto(' ', 'modelo').gerar(contexto));
  assert.deepEqual(await new NvidiaApiClient({ apiKey: '' }).extrairDados('texto'), {});
  await assert.rejects(new NvidiaDecisorFiscal('', 'modelo').decidir({}));
  await assert.rejects(new NvidiaDecisorTribemd('', 'modelo').decidir({ ferramentas: [], passo: 1, pacientes: 0, agendamentos: 0 }));
  assert.equal(chamadas, 0);
});

test('Assistente gera apresentação com o guia sem enviar nome provisório à NVIDIA', async t => {
  const { NvidiaGeradorMensagemNoto } = await adaptadores();
  const { GerenciadorConversaOnboarding } = await import('../../agente-conversa/gerenciador-conversa-onboarding.js');
  let body: any;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return resposta({ mensagens: ['Oi! Sou o Noto. Como é seu nome completo?'] });
  });
  const gerenciador = new GerenciadorConversaOnboarding({
    async buscarDadosMedicoOnline() { assert.fail('cadastro provisório não autoriza busca'); },
    async salvarEstadoOnboarding() {}
  } as any, new NvidiaGeradorMensagemNoto('chave-teste', 'modelo'));
  const resultado = await gerenciador.iniciarAoConectar('med-1', 'médico x');
  assert.deepEqual(resultado.mensagensEnviar, ['Oi! Sou o Noto. Como é seu nome completo?']);
  const guia = await readFile(new URL('../../../docs/prompts/noto-conversa.md', import.meta.url), 'utf8');
  assert.ok(body.messages[0].content.includes(guia));
  assert.match(body.messages[0].content, /ONBOARDING DO NOTO ASSISTENTE/);
  const contexto = JSON.parse(body.messages[1].content);
  assert.equal(contexto.medico.nome, null);
  assert.equal(contexto.dados.objetivo, 'apresentar_e_pedir_nome');
  assert.equal(body.messages[1].content.includes('médico x'), false);
});
