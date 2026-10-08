import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { describe, it, type TestContext } from 'node:test';
import type pg from 'pg';
import type { AppConfig } from '../../config.js';
import { criarDisparadorTreino } from './disparar-treino-onboarding.js';

const config: AppConfig = {
  porta: 3000, host: 'localhost', databaseUrl: '', supabaseUrl: '', supabaseServiceRoleKey: '',
  encryptionKey: '', appPepper: '', evolutionApiUrl: 'https://evolution.test',
  evolutionGlobalApiKey: 'test-key', evolutionWebhookSecret: '', evolutionOfficialInstanceName: 'noto-oficial',
  nvidiaApiKey: '', nvidiaModel: '', treinoOnboardingAtivo: true, preparacaoFiscalAtiva: true
};

// Only PostgreSQL and HTTP are replaced: status, dispatcher, reservation and sending run for real.
function preparar(t: TestContext, disponibilidade: { certificados: number; conexoes: number }) {
  const envios: Array<{ url: string; body: Record<string, unknown> }> = [];
  let registro: { etapa: number; estado: string; eventos: Array<Record<string, any>> } | undefined;
  let consultas = 0;
  const pool = { async query(sql: string, params: unknown[]) {
    assert.equal(params[0], 'med-1');
    if (sql.includes('from medicos m')) {
      consultas++;
      return { rows: [{ medico_id: 'med-1', usuario_id: 'usr-1', medico_nome: null,
        usuario_nome: 'Médico', telefone: '(11) 99999-1234', email: null, crm: null, rqe: null,
        especialidade: null, razao_social: null, inscricao_municipal: null, uf: null,
        cod_municipio_ibge: null, serie_dps: null, proximo_numero_dps: null,
        opcao_simples_nacional: null, extraido_automaticamente: false, confirmado_pelo_medico: false,
        dados_reforma_tributaria: null, parametros_emissao: null, aliquota_iss: null,
        numero_whatsapp: disponibilidade.conexoes ? '5511999991234' : null,
        cert_ativos: disponibilidade.certificados, whats_conectados: disponibilidade.conexoes }] };
    }
    if (sql.startsWith('insert into onboarding_treinos_whatsapp')) {
      registro ??= { etapa: 0, estado: 'pendente', eventos: JSON.parse(params[1] as string) };
      return { rows: [], rowCount: 1 };
    }
    assert.ok(registro, 'a reserva requer um treino persistido');
    if (sql.includes("set estado = 'enviando'")) {
      if (registro.estado !== 'pendente') return { rows: [], rowCount: 0 };
      registro.estado = 'enviando';
      return { rows: [{ etapa: registro.etapa, eventos: registro.eventos }], rowCount: 1 };
    }
    assert.ok(sql.includes('set etapa = $3'), 'consulta inesperada');
    assert.equal(registro.estado, 'enviando');
    assert.equal(registro.etapa, params[1]);
    registro.etapa = params[2] as number;
    registro.estado = registro.etapa >= registro.eventos[0].mensagens.length ? 'concluido' : params[3] as string;
    registro.eventos.push(JSON.parse(params[4] as string));
    return { rows: [], rowCount: 1 };
  } } as unknown as pg.Pool;
  t.mock.method(globalThis, 'fetch', async (url: string, options: RequestInit) => {
    assert.equal(options.method, 'POST');
    assert.equal((options.headers as Record<string, string>).apikey, 'test-key');
    envios.push({ url: String(url), body: JSON.parse(options.body as string) });
    return new Response(JSON.stringify({ key: { id: `msg-${envios.length}` } }), { status: 200 });
  });
  return { disparar: criarDisparadorTreino(pool, config), envios,
    registro: () => registro, consultas: () => consultas };
}

async function aguardarDisparo() {
  // The dispatcher returns void; one event-loop turn drains its resolved DB/HTTP promises.
  await setImmediate();
}

describe('criarDisparadorTreino', () => {
  it('envia o roteiro com A1 e WhatsApp conectado mesmo sem aprovação fiscal ou nome profissional', async t => {
    // Reintroducing liberadoParaEmitir here would suppress all welcome messages.
    const caso = preparar(t, { certificados: 1, conexoes: 1 });
    caso.disparar('med-1');
    await aguardarDisparo();
    assert.equal(caso.envios.length, 5);
    assert.equal(caso.registro()?.estado, 'concluido');
    assert.equal(caso.registro()?.etapa, 5);
    assert.ok(caso.envios.every(envio => envio.body.number === '5511999991234'));
    assert.equal(caso.envios[2].url, 'https://evolution.test/message/sendButtons/noto-oficial');
    assert.equal(caso.registro()?.eventos.filter(evento => evento.acao === 'resultado').length, 5);
  });

  for (const [nome, disponibilidade] of [
    ['sem certificado A1 válido', { certificados: 0, conexoes: 1 }],
    ['com WhatsApp desconectado', { certificados: 1, conexoes: 0 }]
  ] as const) {
    it(`não inicia o treino ${nome}`, async t => {
      // Removing either readiness requirement must make this test fail.
      const caso = preparar(t, disponibilidade);
      caso.disparar('med-1');
      await aguardarDisparo();
      assert.equal(caso.consultas(), 1);
      assert.equal(caso.envios.length, 0);
      assert.equal(caso.registro(), undefined);
    });
  }

  it('preserva a reserva entre disparos concorrentes e não repete um treino concluído', async t => {
    const caso = preparar(t, { certificados: 1, conexoes: 1 });
    caso.disparar('med-1');
    caso.disparar('med-1');
    await aguardarDisparo();
    assert.equal(caso.envios.length, 5);
    caso.disparar('med-1');
    await aguardarDisparo();
    assert.equal(caso.consultas(), 3);
    assert.equal(caso.envios.length, 5);
    assert.equal(caso.registro()?.estado, 'concluido');
  });
});
