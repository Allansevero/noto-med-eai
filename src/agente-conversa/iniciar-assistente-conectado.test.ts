import assert from 'node:assert/strict';
import { test } from 'node:test';
import { iniciarAssistenteConectado } from './iniciar-assistente-conectado.js';
import { GerenciadorConversaOnboarding } from './gerenciador-conversa-onboarding.js';

// Só as fronteiras PostgreSQL/HTTP são substituídas; o roteiro e a reserva são reais.
function ambiente(opcoes: { conectado?: boolean; estadoAnterior?: boolean; falharEnvio?: number } = {}) {
  let reservado = false, estado: any = opcoes.estadoAnterior ? { etapa: 'concluido' } : null;
  let reservaLiberada = false;
  const envios: string[] = [], resultados: any[] = [];
  const medico = { id: 'med-1', nome_completo: 'Roberto Santos', telefone: '5511999991234', conectado: opcoes.conectado !== false };
  let fila = Promise.resolve();
  const pool = {
    async connect() {
      let liberarAtual: () => void = () => {};
      let possuiReserva = false;
      return {
        async query(sql: string, params: any[] = []) {
          if (sql === 'begin') return { rows: [] };
          if (sql.includes('for update of m')) {
            const anterior = fila;
            fila = new Promise<void>(r => { liberarAtual = r; });
            await anterior;
            return { rows: [medico] };
          }
          if (sql.includes('select id from auditoria')) return { rows: reservado || estado ? [{ id: 'anterior' }] : [] };
          if (sql.includes('insert into auditoria')) { reservado = true; possuiReserva = true; return { rows: [{ id: 'reserva-1' }] }; }
          if (sql === 'commit' || sql === 'rollback') { liberarAtual(); return { rows: [] }; }
          throw Error('Consulta inesperada: ' + sql);
        },
        release() { if (possuiReserva) reservaLiberada = true; }
      };
    },
    async query(_sql: string, params: any[]) { resultados.push(JSON.parse(params[1])); return { rows: [] }; }
  };
  const ferramentas = {
    async buscarDadosMedicoOnline() { assert.equal(reservaLiberada, true); return null; },
    async salvarEstadoOnboarding(_id: string, novo: any) { estado = novo; }
  };
  const gerenciador = new GerenciadorConversaOnboarding(ferramentas as any);
  const iniciar = () => iniciarAssistenteConectado({ pool: pool as any, gerenciador,
    salvarEstado: ferramentas.salvarEstadoOnboarding, instanciaNome: 'notomed_assistente',
    enviar: { async enviarTexto(p: any) {
      assert.equal(reservaLiberada, true, 'o envio ocorre após liberar a conexão da reserva');
      envios.push(p.texto);
      return { sucesso: opcoes.falharEnvio !== envios.length };
    }}
  }, 'med-1');
  return { iniciar, envios, resultados, estado: () => estado };
}

test('WhatsApp conectado recebe apresentação e pergunta do roteiro, com estado salvo após envio', async () => {
  const a = ambiente();
  await a.iniciar();
  assert.equal(a.envios.length, 2);
  assert.match(a.envios[0], /Sou o assistente do Noto/);
  assert.match(a.envios[1], /CRM/);
  assert.equal(a.estado().etapa, 'confirmacao_crm_rqe');
  assert.equal(a.resultados.at(-1).estado, 'enviado');
});

test('webhook e consultas simultâneas não repetem a apresentação', async () => {
  const a = ambiente();
  await Promise.all([a.iniciar(), a.iniciar(), a.iniciar()]);
  await a.iniciar();
  assert.equal(a.envios.length, 2);
});

test('reconexão preserva conversa já iniciada', async () => {
  const a = ambiente({ estadoAnterior: true });
  await a.iniciar();
  assert.equal(a.envios.length, 0);
  assert.equal(a.estado().etapa, 'concluido');
});

test('cadastro sem WhatsApp conectado ainda não recebe apresentação', async () => {
  const a = ambiente({ conectado: false });
  await a.iniciar();
  assert.equal(a.envios.length, 0);
});

test('falha retornada pelo transporte é registrada e não dispara reenvio incerto', async () => {
  const a = ambiente({ falharEnvio: 1 });
  await a.iniciar();
  await a.iniciar();
  assert.equal(a.envios.length, 1);
  assert.equal(a.estado(), null);
  assert.equal(a.resultados.at(-1).estado, 'incerto');
  assert.equal(a.resultados.at(-1).mensagensConfirmadas, 0);
});
