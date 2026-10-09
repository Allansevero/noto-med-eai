/**
 * Testes unitários para FilaEnvioMensagens:
 * - Retentativa única com intervalo (mockado);
 * - Atendimento de duas sessões em paralelo;
 * - Preservação e recuperação de mensagens não enviadas após reinício.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { FilaEnvioMensagens, type EnviadorApiWhatsApp } from './fila-envio-mensagens.js';
import { GerenciadorRascunho } from '../conversa/gerenciador-rascunho.js';
import type {
  RascunhoConversaRepositorio,
  RascunhoConversaRegistro,
  DadosRascunhoOnboarding
} from '../conversa/rascunho-conversa-repositorio.js';

class MockRascunhoRepositorio implements RascunhoConversaRepositorio {
  public memoria = new Map<string, RascunhoConversaRegistro>();

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

test('fila executa retentativa única após falha temporária', async () => {
  let tentativas = 0;
  const mockEnviador: EnviadorApiWhatsApp = {
    async enviarTexto() {
      tentativas++;
      if (tentativas === 1) return { sucesso: false, erro: 'timeout' };
      return { sucesso: true };
    }
  };

  const repo = new MockRascunhoRepositorio();
  const gerenciadorRascunho = new GerenciadorRascunho(repo);
  const fila = new FilaEnvioMensagens(mockEnviador, gerenciadorRascunho, 10); // 10ms para o teste ser rápido

  const res = await fila.enfileirarEEnviar({
    conversaId: 'conv-1',
    instanciaNome: 'inst-1',
    contatoTelefone: '5511999990001',
    mensagens: ['Olá doutora']
  });

  assert.equal(tentativas, 2);
  assert.equal(res.enviadas, 1);
  assert.equal(res.falhas, 0);
});

test('atende duas sessões diferentes em paralelo', async () => {
  const enviadasPorSessao: string[] = [];
  const mockEnviador: EnviadorApiWhatsApp = {
    async enviarTexto(params) {
      enviadasPorSessao.push(params.instanciaNome);
      return { sucesso: true };
    }
  };

  const repo = new MockRascunhoRepositorio();
  const gerenciadorRascunho = new GerenciadorRascunho(repo);
  const fila = new FilaEnvioMensagens(mockEnviador, gerenciadorRascunho, 10);

  const [res1, res2] = await Promise.all([
    fila.enfileirarEEnviar({
      conversaId: 'sessao-1',
      instanciaNome: 'inst-1',
      contatoTelefone: '5511111111111',
      mensagens: ['Msg 1']
    }),
    fila.enfileirarEEnviar({
      conversaId: 'sessao-2',
      instanciaNome: 'inst-2',
      contatoTelefone: '5522222222222',
      mensagens: ['Msg 2']
    })
  ]);

  assert.equal(res1.enviadas, 1);
  assert.equal(res2.enviadas, 1);
  assert.equal(enviadasPorSessao.length, 2);
});

test('recupera respostas antigas não enviadas do rascunho persistente', async () => {
  const repo = new MockRascunhoRepositorio();
  // Simula estado anterior persistido com mensagens pendentes
  await repo.salvar('conv-persistida', 'inst-1', '5511999998888', {
    interlocutor: 'medica',
    etapaAtual: 'apresentacao',
    identidadeMedicaConfirmada: false,
    statusCadastro: 'pendente',
    respostasNaoEnviadas: ['Mensagem pendente da sessão anterior']
  });

  const mensagensEnviadas: string[] = [];
  const mockEnviador: EnviadorApiWhatsApp = {
    async enviarTexto(params) {
      mensagensEnviadas.push(params.texto);
      return { sucesso: true };
    }
  };

  const gerenciadorRascunho = new GerenciadorRascunho(repo);
  const fila = new FilaEnvioMensagens(mockEnviador, gerenciadorRascunho, 10);

  const res = await fila.enfileirarEEnviar({
    conversaId: 'conv-persistida',
    instanciaNome: 'inst-1',
    contatoTelefone: '5511999998888',
    mensagens: ['Nova mensagem']
  });

  assert.equal(res.enviadas, 2);
  assert.equal(mensagensEnviadas[0], 'Mensagem pendente da sessão anterior');
  assert.equal(mensagensEnviadas[1], 'Nova mensagem');
});
