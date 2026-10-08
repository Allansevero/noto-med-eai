import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { ContextoMensagemNoto } from '../../conversa/comunicador-noto.js';
import { GroqGeradorMensagemNoto } from './groq-gerador-mensagem-noto.js';

const contexto: ContextoMensagemNoto = {
  evento: 'falha_emissao', destinatario: 'medico', medico: { nome: 'Helena Real', crm: null, rqe: null },
  caso: { solicitacaoId: 'caso-real', nomePaciente: 'Livia Santos', telefonePaciente: '5511987654321',
    valorCentavos: 76345, datas: '2026-10-06', status: 'aguardando_dados',
    aguardandoDadosProfissionais: true, aguardandoConfirmacao: false },
  quantidadeNotasParadas: 2, mensagemRecebida: 'Já mandei meu nome, o que falta?', dados: { campoFaltante: 'crm' },
  historico: [{ papel: 'medico', texto: 'Meu nome é Helena Real' }, { papel: 'noto', texto: 'Nome salvo.' }]
};
function resposta(conteudo: unknown): Response {
  return new Response(JSON.stringify({ choices: [{ message: { content: typeof conteudo === 'string' ? conteudo : JSON.stringify(conteudo) } }] }), { status: 200 });
}

test('envia o guia v2 integral, fatos reais e histórico ao modelo e devolve seu texto', async t => {
  let requisicao: any;
  let destino: unknown;
  let sinal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    destino = url; requisicao = JSON.parse(init.body as string); sinal = init.signal as AbortSignal;
    return resposta({ mensagens: ['A nota da Livia Santos, de R$ 763,45, precisa do seu CRM. Qual é?'] });
  });
  const mensagens = await new GroqGeradorMensagemNoto('chave-falsa', 'modelo-real').gerar(contexto);
  assert.deepEqual(mensagens, ['A nota da Livia Santos, de R$ 763,45, precisa do seu CRM. Qual é?']);
  assert.equal(destino, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(requisicao.model, 'modelo-real');
  assert.deepEqual(requisicao.response_format, { type: 'json_object' });
  assert.ok(sinal instanceof AbortSignal);
  const guia = await readFile(new URL('../../../docs/prompts/noto-conversa.md', import.meta.url), 'utf8');
  assert.ok(guia.includes('O formato de todo aviso'));
  assert.ok(requisicao.messages[0].content.includes(guia));
  assert.deepEqual(JSON.parse(requisicao.messages.at(-1).content), contexto);
  assert.match(requisicao.messages[0].content, /dados não confiáveis/i);
  assert.match(requisicao.messages[0].content, /primeira frase/i);
  assert.match(requisicao.messages[0].content, /Não peça "pode emitir" nem uma nova autorização/);
});

test('preserva respostas diferentes do modelo em vez de substituir por frases prontas', async t => {
  let chamada = 0;
  t.mock.method(globalThis, 'fetch', async () => resposta({ mensagens: [++chamada === 1 ? 'Qual CRM você usa?' : 'Me manda seu CRM?'] }));
  const gerador = new GroqGeradorMensagemNoto('fake', 'modelo');
  assert.deepEqual(await gerador.gerar(contexto), ['Qual CRM você usa?']);
  assert.deepEqual(await gerador.gerar(contexto), ['Me manda seu CRM?']);
});

test('rejeita JSON malformado e contrato inválido sem mensagem de fallback', async t => {
  const fake = t.mock.method(globalThis, 'fetch', async () => resposta('sem JSON'));
  for (const invalida of ['sem JSON', { mensagens: [] }, { mensagens: ['a', 'b', 'c', 'd'] },
    { mensagens: [' '.repeat(2)] }, { mensagens: ['a'.repeat(501)] }, { mensagens: [12] },
    { mensagens: ['válida'], acao: 'emitir' }, { mensagens: ['válida'], token: 'SEGREDO-PROVEDOR' }]) {
    fake.mock.mockImplementation(async () => resposta(invalida));
    await assert.rejects(() => new GroqGeradorMensagemNoto('TOKEN-PRIVADO', 'modelo').gerar(contexto), erro => {
      assert.ok(erro instanceof Error);
      assert.equal(erro.message, 'Não foi possível gerar a mensagem do Noto');
      assert.doesNotMatch(erro.message, /SEGREDO|TOKEN|emitir|sem JSON/);
      return true;
    });
  }
});

test('não expõe chave, corpo de erro HTTP ou erro de rede', async t => {
  const fake = t.mock.method(globalThis, 'fetch', async () => new Response('token=TOKEN-PRIVADO; SEGREDO-PROVEDOR', { status: 429 }));
  for (const falha of ['http', 'rede', 'json', 'envelope']) {
    fake.mock.mockImplementation(async () => {
      if (falha === 'rede') throw new Error('TOKEN-PRIVADO SEGREDO-PROVEDOR');
      if (falha === 'json') return new Response('TOKEN-PRIVADO SEGREDO-PROVEDOR', { status: 200 });
      if (falha === 'envelope') return new Response('{"choices":[]}', { status: 200 });
      return new Response('TOKEN-PRIVADO SEGREDO-PROVEDOR', { status: 429 });
    });
    await assert.rejects(() => new GroqGeradorMensagemNoto('TOKEN-PRIVADO', 'modelo').gerar(contexto), erro => {
      assert.ok(erro instanceof Error);
      assert.equal(erro.message, 'Não foi possível gerar a mensagem do Noto');
      assert.doesNotMatch(erro.message, /TOKEN-PRIVADO|SEGREDO-PROVEDOR/);
      assert.equal(erro.cause, undefined);
      return true;
    });
  }
});

test('chave ausente impede a chamada externa', async t => {
  let chamadas = 0;
  t.mock.method(globalThis, 'fetch', async () => { chamadas++; return resposta({ mensagens: ['texto'] }); });
  await assert.rejects(() => new GroqGeradorMensagemNoto('  ', 'modelo').gerar(contexto), { message: 'Gerador de mensagens do Noto não configurado' });
  assert.equal(chamadas, 0);
});
