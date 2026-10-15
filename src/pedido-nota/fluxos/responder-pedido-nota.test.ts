import test from 'node:test';
import assert from 'node:assert';
import { responderPedidoNota } from './responder-pedido-nota.js';
import type { PedidosRepositorio } from '../io/pedidos-repositorio.js';

test('responderPedidoNota: confirmação aciona processarEmissaoApi e avisa médico', async () => {
  let emissaoChamadaCom: any = null;
  const mensagensEnviadas: string[] = [];

  const fakePedidoAtivo: any = {
    id: 'ped-1',
    medicoId: 'med-1',
    status: 'aguardando_confirmacao',
    nomePaciente: 'Antônio Marques Silva',
    cpfLimpo: '52998224725',
    telefonePaciente: '51998124521',
    valorCentavos: 40000,
    dataConsulta: '14/10/2026',
    referenciaExterna: 'ped_ref_123'
  };

  const fakeRepo: PedidosRepositorio = {
    buscarPedidoAtivoPorMedico: async () => fakePedidoAtivo,
    atualizarStatusPedido: async () => {},
    salvarNovoPedido: async () => fakePedidoAtivo,
    buscarPedidoPorId: async () => fakePedidoAtivo,
    cancelarPedidosAtivosAnteriores: async () => {},
    obterDadosMedico: async () => null
  };

  const fakeEmissaoApiRepo: any = {};
  const fakeProcessarEmissaoApi = async (payload: any) => {
    emissaoChamadaCom = payload;
    return {
      ok: true as const,
      statusHttp: 201 as const,
      resposta: {
        status: 'processando_autorizacao' as const,
        ref: payload.ref,
        solicitacaoId: 'sol-999',
        mensagem: 'OK'
      }
    };
  };

  const res = await responderPedidoNota(
    {
      medicoId: 'med-1',
      texto: 'Sim',
      telefoneMedico: '5511999999999'
    },
    {
      repositorio: fakeRepo,
      emissaoApiRepo: fakeEmissaoApiRepo,
      processarEmissaoApi: fakeProcessarEmissaoApi,
      enviarMensagemAoMedico: async (_tel, txt) => {
        mensagensEnviadas.push(txt);
        return true;
      }
    }
  );

  assert.strictEqual(res.tratado, true);
  if (res.tratado) {
    assert.strictEqual(res.acao, 'emissao_enfileirada');
  }
  assert.ok(emissaoChamadaCom);
  assert.strictEqual(emissaoChamadaCom.ref, 'ped_ref_123');
  assert.strictEqual(emissaoChamadaCom.valor, 400);
  assert.strictEqual(emissaoChamadaCom.paciente.cpf, '52998224725');
  assert.strictEqual(emissaoChamadaCom.paciente.nome, 'Antônio Marques Silva');
  assert.strictEqual(emissaoChamadaCom.datasConsultas, '14/10/2026');
  assert.strictEqual(mensagensEnviadas.length, 1);
  assert.ok(mensagensEnviadas[0].includes('Antônio Marques Silva'));
  assert.ok(mensagensEnviadas[0].includes('fila de emissão'));
});

test('responderPedidoNota: cancelamento encerra o pedido', async () => {
  let statusAtualizado: string | null = null;
  const fakePedidoAtivo: any = {
    id: 'ped-2',
    medicoId: 'med-1',
    status: 'aguardando_confirmacao',
    nomePaciente: 'João Silva',
    valorCentavos: 35000
  };

  const fakeRepo: PedidosRepositorio = {
    buscarPedidoAtivoPorMedico: async () => fakePedidoAtivo,
    atualizarStatusPedido: async (_id, status) => {
      statusAtualizado = status;
    },
    salvarNovoPedido: async () => fakePedidoAtivo,
    buscarPedidoPorId: async () => fakePedidoAtivo,
    cancelarPedidosAtivosAnteriores: async () => {},
    obterDadosMedico: async () => null
  };

  const res = await responderPedidoNota(
    {
      medicoId: 'med-1',
      texto: 'Cancela',
      telefoneMedico: '5511999999999'
    },
    {
      repositorio: fakeRepo,
      emissaoApiRepo: {} as any,
      processarEmissaoApi: async () => ({} as any),
      enviarMensagemAoMedico: async () => true
    }
  );

  assert.strictEqual(res.tratado, true);
  if (res.tratado) {
    assert.strictEqual(res.acao, 'cancelado');
  }
  assert.strictEqual(statusAtualizado, 'cancelado');
});
