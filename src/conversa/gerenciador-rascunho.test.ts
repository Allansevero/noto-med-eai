/**
 * Testes unitários para o Gerenciador de Rascunho Persistente de Conversa.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { GerenciadorRascunho } from './gerenciador-rascunho.js';
import type {
  RascunhoConversaRepositorio,
  RascunhoConversaRegistro,
  DadosRascunhoOnboarding
} from './rascunho-conversa-repositorio.js';

class MockRascunhoRepositorio implements RascunhoConversaRepositorio {
  private memoria = new Map<string, RascunhoConversaRegistro>();

  async buscarPorContato(conversaId: string): Promise<RascunhoConversaRegistro | null> {
    return this.memoria.get(conversaId) || null;
  }

  async salvar(
    conversaId: string,
    instanciaNome: string,
    contatoTelefone: string,
    dados: DadosRascunhoOnboarding
  ): Promise<RascunhoConversaRegistro> {
    const registro: RascunhoConversaRegistro = {
      id: `rascunho-${conversaId}`,
      conversaId,
      instanciaNome,
      contatoTelefone,
      dados,
      criadoEm: new Date(),
      atualizadoEm: new Date()
    };
    this.memoria.set(conversaId, registro);
    return registro;
  }

  async remover(conversaId: string): Promise<void> {
    this.memoria.delete(conversaId);
  }
}

test('cria rascunho inicial quando não existe', async () => {
  const repo = new MockRascunhoRepositorio();
  const gerenciador = new GerenciadorRascunho(repo);

  const rascunho = await gerenciador.obterOuCriar('conv-1', 'inst-noto', '5511999990000');
  assert.equal(rascunho.dados.interlocutor, 'desconhecido');
  assert.equal(rascunho.dados.identidadeMedicaConfirmada, false);
  assert.equal(rascunho.dados.statusCadastro, 'pendente');
});

test('atualiza dados parciais no rascunho preservando o histórico', async () => {
  const repo = new MockRascunhoRepositorio();
  const gerenciador = new GerenciadorRascunho(repo);

  await gerenciador.obterOuCriar('conv-1', 'inst-noto', '5511999990000');
  const atualizado = await gerenciador.atualizar('conv-1', 'inst-noto', '5511999990000', {
    nomeMedica: 'Dra. Luiza Castro',
    crm: '554433',
    ufCrm: 'SP',
    identidadeMedicaConfirmada: true,
    statusCadastro: 'confirmado'
  });

  assert.equal(atualizado.dados.nomeMedica, 'Dra. Luiza Castro');
  assert.equal(atualizado.dados.crm, '554433');
  assert.equal(atualizado.dados.identidadeMedicaConfirmada, true);
  assert.equal(atualizado.dados.statusCadastro, 'confirmado');
});

test('enfileira mensagens não enviadas em caso de falha e limpa após sucesso', async () => {
  const repo = new MockRascunhoRepositorio();
  const gerenciador = new GerenciadorRascunho(repo);

  await gerenciador.enfileirarMensagensPendentes('conv-1', 'inst-noto', '5511999990000', [
    'Mensagem 1 preparada',
    'Mensagem 2 preparada'
  ]);

  let rascunho = await gerenciador.obterOuCriar('conv-1', 'inst-noto', '5511999990000');
  assert.equal(rascunho.dados.respostasNaoEnviadas?.length, 2);

  await gerenciador.limparMensagensPendentes('conv-1', 'inst-noto', '5511999990000');
  rascunho = await gerenciador.obterOuCriar('conv-1', 'inst-noto', '5511999990000');
  assert.equal(rascunho.dados.respostasNaoEnviadas?.length, 0);
});
