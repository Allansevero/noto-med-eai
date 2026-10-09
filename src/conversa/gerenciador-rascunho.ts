/**
 * Gerenciador de rascunhos persistentes da conversa.
 * Garante que a evolução da coleta de dados, a identificação do interlocutor
 * e as mensagens pendentes resistam a reinícios do processo.
 */

import type {
  RascunhoConversaRepositorio,
  RascunhoConversaRegistro,
  DadosRascunhoOnboarding
} from './rascunho-conversa-repositorio.js';

export class GerenciadorRascunho {
  constructor(private readonly repositorio: RascunhoConversaRepositorio) {}

  async obterOuCriar(
    conversaId: string,
    instanciaNome: string,
    contatoTelefone: string
  ): Promise<RascunhoConversaRegistro> {
    const existente = await this.repositorio.buscarPorContato(conversaId);
    if (existente) return existente;

    const dadosIniciais: DadosRascunhoOnboarding = {
      interlocutor: 'desconhecido',
      etapaAtual: 'apresentacao',
      identidadeMedicaConfirmada: false,
      statusCadastro: 'pendente',
      respostasNaoEnviadas: []
    };

    return this.repositorio.salvar(conversaId, instanciaNome, contatoTelefone, dadosIniciais);
  }

  async atualizar(
    conversaId: string,
    instanciaNome: string,
    contatoTelefone: string,
    novosDados: Partial<DadosRascunhoOnboarding>
  ): Promise<RascunhoConversaRegistro> {
    const atual = await this.obterOuCriar(conversaId, instanciaNome, contatoTelefone);
    const dadosMesclados: DadosRascunhoOnboarding = {
      ...atual.dados,
      ...novosDados
    };

    return this.repositorio.salvar(conversaId, instanciaNome, contatoTelefone, dadosMesclados);
  }

  async enfileirarMensagensPendentes(
    conversaId: string,
    instanciaNome: string,
    contatoTelefone: string,
    mensagens: string[]
  ): Promise<RascunhoConversaRegistro> {
    const atual = await this.obterOuCriar(conversaId, instanciaNome, contatoTelefone);
    const pendentes = [...(atual.dados.respostasNaoEnviadas || []), ...mensagens];

    return this.repositorio.salvar(conversaId, instanciaNome, contatoTelefone, {
      ...atual.dados,
      respostasNaoEnviadas: pendentes
    });
  }

  async limparMensagensPendentes(
    conversaId: string,
    instanciaNome: string,
    contatoTelefone: string
  ): Promise<RascunhoConversaRegistro> {
    const atual = await this.obterOuCriar(conversaId, instanciaNome, contatoTelefone);
    return this.repositorio.salvar(conversaId, instanciaNome, contatoTelefone, {
      ...atual.dados,
      respostasNaoEnviadas: []
    });
  }
}
