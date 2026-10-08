/**
 * Testes unitários para o fluxo conversacional do Noto Assistente no onboarding.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GerenciadorConversaOnboarding,
  type EstadoAssistenteMedico
} from './gerenciador-conversa-onboarding.js';
import { FerramentasAssistenteNoto } from './ferramentas-assistente-noto.js';

function mockAmbiente(overrides?: {
  dadosOnline?: any;
  resumoPacientes?: { totalPacientesCadastrados: number; totalNotasEmitidas: number; totalNotasPendentes: number };
}) {
  const queries: Array<{ sql: string; params?: any[] }> = [];
  const mensagensEnviadas: Array<{ texto: string; telefone: string }> = [];

  const pool = {
    async query(sql: string, params?: any[]) {
      queries.push({ sql, params });
      if (sql.includes('select usuario_id from medicos')) return { rows: [{ usuario_id: 'usr-1' }] };
      if (sql.includes('count(*)::integer as total from pacientes')) {
        return { rows: [{ total: overrides?.resumoPacientes?.totalPacientesCadastrados ?? 5 }] };
      }
      return { rows: [] };
    },
    async connect() {
      return {
        async query(sql: string, params?: any[]) {
          queries.push({ sql, params });
          if (sql.includes('select usuario_id from medicos')) return { rows: [{ usuario_id: 'usr-1' }] };
          return { rows: [] };
        },
        release() {}
      };
    }
  } as any;

  const buscarMedicoOnlineProvider = {
    async buscarPorNome(nome: string, uf?: string) {
      if (overrides?.dadosOnline !== undefined) return overrides.dadosOnline;
      return {
        nomeCompleto: nome,
        crm: '123456',
        uf: uf || 'SP',
        rqe: '7890',
        especialidade: 'Psiquiatria',
        situacao: 'Ativo'
      };
    }
  };

  const paligemmaClient = {
    async analisarImagem() {
      return { ehComprovante: true, valorCentavos: 40000 };
    }
  } as any;

  const enviadorMensagem = {
    async enviarTexto(params: any) {
      mensagensEnviadas.push({ texto: params.texto, telefone: params.contatoTelefone });
      return { sucesso: true, mensagemId: 'msg-env-1' };
    }
  };

  const ferramentas = new FerramentasAssistenteNoto(
    pool,
    buscarMedicoOnlineProvider,
    paligemmaClient,
    enviadorMensagem
  );

  const gerenciador = new GerenciadorConversaOnboarding(ferramentas);

  return { gerenciador, ferramentas, queries, mensagensEnviadas };
}

test('ao conectar com nome completo, busca online e pergunta se CRM/RQE está correto', async () => {
  const { gerenciador } = mockAmbiente();
  const resp = await gerenciador.iniciarAoConectar('med-1', 'Dr. Roberto Santos', 'SP');

  assert.equal(resp.novoEstado.etapa, 'confirmacao_crm_rqe');
  assert.equal(resp.novoEstado.crmSugerido, '123456');
  assert.equal(resp.novoEstado.rqeSugerido, '7890');
  assert.equal(resp.mensagensEnviar.length, 2);
  assert.match(resp.mensagensEnviar[1], /CRM 123456\/SP/);
  assert.match(resp.mensagensEnviar[1], /RQE 7890/);
  assert.match(resp.mensagensEnviar[1], /Está correto\? Posso salvar/);
});

test('médico confirma CRM/RQE, assistente salva, apresenta pacientes e pergunta janela de tempo', async () => {
  const { gerenciador, queries } = mockAmbiente({
    resumoPacientes: { totalPacientesCadastrados: 12, totalNotasEmitidas: 0, totalNotasPendentes: 0 }
  });

  const estado: EstadoAssistenteMedico = {
    etapa: 'confirmacao_crm_rqe',
    crmSugerido: '123456',
    rqeSugerido: '7890',
    especialidadeSugerida: 'Psiquiatria'
  };

  const resp = await gerenciador.processarMensagemMedico({
    medicoId: 'med-1',
    estadoAtual: estado,
    textoRecebido: 'Sim, está correto, pode salvar'
  });

  assert.equal(resp.novoEstado.etapa, 'aguardando_janela_tempo');
  assert.ok(queries.some(q => q.sql.includes('update medicos set')));
  assert.match(resp.mensagensEnviar[0], /Prontinho, dados salvos/);
  assert.match(resp.mensagensEnviar[1], /Encontrei 12 paciente\(s\)/);
  assert.match(resp.mensagensEnviar[2], /quanto tempo está sem emitir notas/);
});

test('médico responde janela temporal, assistente define data e pergunta preferência de data da consulta', async () => {
  const { gerenciador } = mockAmbiente();

  const estado: EstadoAssistenteMedico = {
    etapa: 'aguardando_janela_tempo'
  };

  const resp = await gerenciador.processarMensagemMedico({
    medicoId: 'med-1',
    estadoAtual: estado,
    textoRecebido: 'Estou há mais ou menos 2 meses sem emitir notas'
  });

  assert.equal(resp.novoEstado.etapa, 'perguntar_preferencia_data');
  assert.ok(resp.novoEstado.janelaDataCorte);
  assert.match(resp.mensagensEnviar[0], /já configurei esse período e vou começar a varrer os comprovantes/i);
  assert.match(resp.mensagensEnviar[1], /pergunte uma data por vez aos pacientes.*mesma do comprovante/i);
});

test('médico escolhe mesma data do comprovante e assistente conclui o alinhamento', async () => {
  const { gerenciador, queries } = mockAmbiente();

  const estado: EstadoAssistenteMedico = {
    etapa: 'perguntar_preferencia_data',
    janelaDataCorte: '2026-08-01'
  };

  const resp = await gerenciador.processarMensagemMedico({
    medicoId: 'med-1',
    estadoAtual: estado,
    textoRecebido: 'Pode colocar a data da consulta a mesma do comprovante'
  });

  assert.equal(resp.novoEstado.etapa, 'concluido');
  assert.ok(queries.some(q => q.sql.includes('preferencia_data_consulta')));
  assert.match(resp.mensagensEnviar[0], /Vou considerar a data do comprovante/);
  assert.match(resp.mensagensEnviar[1], /Tudo configurado/);
});

test('pedirCpfPaciente envia mensagem humanizada sem dizer que é IA', async () => {
  const { ferramentas, mensagensEnviadas } = mockAmbiente();

  const res = await ferramentas.pedirCpfPaciente({
    instanciaNome: 'inst-medico',
    pacienteTelefone: '5511999998888',
    pacienteNome: 'Mariana Silveira'
  });

  assert.equal(res.sucesso, true);
  assert.equal(mensagensEnviadas.length, 1);
  const msg = mensagensEnviadas[0].texto;

  assert.match(msg, /Olá, Mariana!/);
  assert.match(msg, /Para eu emitir sua nota fiscal da consulta, você poderia me confirmar seu CPF por favor\?/);
  assert.doesNotMatch(msg, /sou uma IA|inteligência artificial|assistente virtual|robô/i);
});
