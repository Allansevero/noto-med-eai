/**
 * Porta do repositório de pedidos de notas solicitadas pelo médico.
 * Permite isolar o ciclo de vida do pedido do banco de dados relacional.
 */

import type { CriarPedidoNotaParams, PedidoNota, StatusPedidoNota } from '../tipos.js';

export interface AtualizarPedidoExtra {
  solicitacaoId?: string;
  valorCentavos?: number;
  cpfLimpo?: string;
  telefonePaciente?: string;
  nomePaciente?: string;
}

export interface PedidosRepositorio {
  salvarNovoPedido(params: CriarPedidoNotaParams): Promise<PedidoNota>;
  buscarPedidoAtivoPorMedico(medicoId: string): Promise<PedidoNota | null>;
  buscarPedidoPorId(id: string): Promise<PedidoNota | null>;
  atualizarStatusPedido(id: string, status: StatusPedidoNota, extra?: AtualizarPedidoExtra): Promise<void>;
  cancelarPedidosAtivosAnteriores(medicoId: string): Promise<void>;
  obterDadosMedico(medicoId: string): Promise<{ id: string; nomeCompleto: string; telefone?: string } | null>;
}
