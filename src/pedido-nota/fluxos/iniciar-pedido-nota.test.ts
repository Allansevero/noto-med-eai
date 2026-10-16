import test from 'node:test';
import assert from 'node:assert';
import { iniciarPedidoNota } from './iniciar-pedido-nota.js';
import type { PedidosRepositorio } from '../io/pedidos-repositorio.js';
import type { FontePacientes } from '../io/fonte-pacientes.js';

test('iniciarPedidoNota: descarta mensagem que não tem gatilho de nota', async () => {
  const deps: any = {
    repositorio: {
      cancelarPedidosAtivosAnteriores: async () => {}
    },
    fontesPacientes: [],
    enviarMensagemAoMedico: async () => true
  };

  const res = await iniciarPedidoNota(
    {
      medicoId: 'med-1',
      mensagemId: 'msg-1',
      texto: 'olá tudo bem?',
      telefoneMedico: '5511999999999'
    },
    deps
  );

  assert.strictEqual(res.tratado, false);
});

test('iniciarPedidoNota: localiza paciente único no Supabase e envia confirmação', async () => {
  const mensagensEnviadas: string[] = [];

  const fakeRepo: PedidosRepositorio = {
    cancelarPedidosAtivosAnteriores: async () => {},
    salvarNovoPedido: async (p) => ({
      id: 'ped-1',
      medicoId: p.medicoId,
      mensagemId: p.mensagemId,
      status: p.status,
      nomePaciente: p.nomePaciente,
      cpfLimpo: p.cpfLimpo,
      telefonePaciente: p.telefonePaciente,
      dataConsulta: p.dataConsulta,
      valorCentavos: p.valorCentavos,
      origemDados: p.origemDados,
      referenciaExterna: p.referenciaExterna,
      expiraEm: new Date(),
      criadoEm: new Date(),
      atualizadoEm: new Date()
    }),
    buscarPedidoAtivoPorMedico: async () => null,
    buscarPedidoPorId: async () => null,
    atualizarStatusPedido: async () => {},
    obterDadosMedico: async () => null
  };

  const fakeFonteSupabase: FontePacientes = {
    nomeFonte: 'supabase',
    buscar: async () => [
      {
        pacienteId: 'pac-1',
        nome: 'Antônio Marques Silva',
        cpfLimpo: '52998224725',
        telefone: '51998124521',
        origem: 'supabase',
        valorSugeridoCentavos: 40000
      }
    ]
  };

  const fakeGemini: any = {
    extrairIntencaoPedido: async () => ({
      ehPedidoNota: true,
      nomePaciente: 'Antônio Marques',
      dataConsultaTexto: 'ontem'
    })
  };

  const res = await iniciarPedidoNota(
    {
      medicoId: 'med-1',
      mensagemId: 'msg-100',
      texto: 'emite a nota do Antônio Marques de ontem',
      telefoneMedico: '5511999999999'
    },
    {
      repositorio: fakeRepo,
      fontesPacientes: [fakeFonteSupabase],
      geminiClient: fakeGemini,
      enviarMensagemAoMedico: async (_tel, txt) => {
        mensagensEnviadas.push(txt);
        return true;
      }
    }
  );

  assert.strictEqual(res.tratado, true);
  if (res.tratado) {
    assert.strictEqual(res.status, 'aguardando_confirmacao');
    assert.strictEqual(res.pedido.nomePaciente, 'Antônio Marques Silva');
    assert.strictEqual(res.pedido.valorCentavos, 40000);
  }
  assert.strictEqual(mensagensEnviadas.length, 1);
  assert.ok(mensagensEnviadas[0].includes('Antônio Marques Silva'));
  assert.ok(mensagensEnviadas[0].includes('400,00'));
});

test('iniciarPedidoNota: solicita dados faltantes quando paciente não é encontrado', async () => {
  const mensagensEnviadas: string[] = [];

  const fakeRepo: PedidosRepositorio = {
    cancelarPedidosAtivosAnteriores: async () => {},
    salvarNovoPedido: async (p) => ({
      id: 'ped-2',
      medicoId: p.medicoId,
      mensagemId: p.mensagemId,
      status: p.status,
      nomePaciente: p.nomePaciente,
      cpfLimpo: p.cpfLimpo,
      telefonePaciente: p.telefonePaciente,
      dataConsulta: p.dataConsulta,
      valorCentavos: p.valorCentavos,
      origemDados: p.origemDados,
      referenciaExterna: p.referenciaExterna,
      expiraEm: new Date(),
      criadoEm: new Date(),
      atualizadoEm: new Date()
    }),
    buscarPedidoAtivoPorMedico: async () => null,
    buscarPedidoPorId: async () => null,
    atualizarStatusPedido: async () => {},
    obterDadosMedico: async () => null
  };

  const fakeFonteVazia: FontePacientes = {
    nomeFonte: 'supabase',
    buscar: async () => []
  };

  const fakeGemini: any = {
    extrairIntencaoPedido: async () => ({
      ehPedidoNota: true,
      nomePaciente: 'Carlos Magno'
    })
  };

  const res = await iniciarPedidoNota(
    {
      medicoId: 'med-1',
      mensagemId: 'msg-101',
      texto: 'gera a nf do Carlos Magno',
      telefoneMedico: '5511999999999'
    },
    {
      repositorio: fakeRepo,
      fontesPacientes: [fakeFonteVazia],
      geminiClient: fakeGemini,
      enviarMensagemAoMedico: async (_tel, txt) => {
        mensagensEnviadas.push(txt);
        return true;
      }
    }
  );

  assert.strictEqual(res.tratado, true);
  if (res.tratado) {
    assert.strictEqual(res.status, 'aguardando_dados_faltantes');
  }
  assert.ok(mensagensEnviadas[0].includes('Não encontrei o cadastro'));
  assert.ok(mensagensEnviadas[0].includes('Carlos Magno'));
  assert.ok(mensagensEnviadas[0].includes('CPF do paciente'));
});
