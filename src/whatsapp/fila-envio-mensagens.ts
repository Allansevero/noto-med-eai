/**
 * Fila de envio de mensagens do WhatsApp com isolamento por sessão,
 * retentativa única após intervalo configurado (5s) e preservação
 * de mensagens não enviadas para sobreviver a reinícios.
 */

import type { GerenciadorRascunho } from '../conversa/gerenciador-rascunho.js';

export interface EnvioMensagemParams {
  conversaId: string;
  instanciaNome: string;
  contatoTelefone: string;
  mensagens: string[];
}

export interface EnviadorApiWhatsApp {
  enviarTexto(params: { instanciaNome: string; contatoTelefone: string; texto: string }): Promise<{ sucesso: boolean; erro?: string }>;
}

export class FilaEnvioMensagens {
  private emProcessamento = new Set<string>();

  constructor(
    private readonly enviador: EnviadorApiWhatsApp,
    private readonly gerenciadorRascunho: GerenciadorRascunho,
    private readonly delayRetentativaMs = 5000
  ) {}

  async enfileirarEEnviar(params: EnvioMensagemParams): Promise<{ enviadas: number; falhas: number }> {
    if (this.emProcessamento.has(params.conversaId)) {
      // Já está em processamento concorrente nesta sessão; evita duplicação
      return { enviadas: 0, falhas: 0 };
    }

    this.emProcessamento.add(params.conversaId);

    try {
      // 1. Carrega pendências antigas preservadas no rascunho + novas
      const rascunho = await this.gerenciadorRascunho.obterOuCriar(
        params.conversaId,
        params.instanciaNome,
        params.contatoTelefone
      );

      const todasMensagens = [
        ...(rascunho.dados.respostasNaoEnviadas || []),
        ...params.mensagens
      ];

      if (todasMensagens.length === 0) {
        return { enviadas: 0, falhas: 0 };
      }

      let enviadas = 0;
      const naoEnviadas: string[] = [];

      for (const msg of todasMensagens) {
        let resultado = await this.enviador.enviarTexto({
          instanciaNome: params.instanciaNome,
          contatoTelefone: params.contatoTelefone,
          texto: msg
        });

        // Retentativa única após 5s se falhar
        if (!resultado.sucesso) {
          await new Promise(resolve => setTimeout(resolve, this.delayRetentativaMs));
          resultado = await this.enviador.enviarTexto({
            instanciaNome: params.instanciaNome,
            contatoTelefone: params.contatoTelefone,
            texto: msg
          });
        }

        if (resultado.sucesso) {
          enviadas++;
        } else {
          naoEnviadas.push(msg);
        }
      }

      // Atualiza o rascunho com o que restou não enviado
      if (naoEnviadas.length > 0) {
        await this.gerenciadorRascunho.atualizar(
          params.conversaId,
          params.instanciaNome,
          params.contatoTelefone,
          { respostasNaoEnviadas: naoEnviadas }
        );
      } else {
        await this.gerenciadorRascunho.limparMensagensPendentes(
          params.conversaId,
          params.instanciaNome,
          params.contatoTelefone
        );
      }

      return { enviadas, falhas: naoEnviadas.length };
    } finally {
      this.emProcessamento.delete(params.conversaId);
    }
  }
}
