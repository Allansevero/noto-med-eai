import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { iniciarAssistenteConectado } from './iniciar-assistente-conectado.js';
import { GerenciadorConversaOnboarding } from './gerenciador-conversa-onboarding.js';
import { PostgresAssistente } from './postgres-assistente.js';
const url = process.env.NOTO_TEST_DATABASE_URL;
if (
  !url ||
  !new URL(url).pathname.includes('test') ||
  !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)
)
  throw Error(
    'Use PostgreSQL local dedicado de teste em NOTO_TEST_DATABASE_URL'
  );
test('reserva concorrente, gravação atômica, ordem, histórico e envio incerto em PostgreSQL real', async () => {
  const admin = new pg.Pool({ connectionString: url });
  const schema = 'assistente_' + Date.now();
  let p: pg.Pool | undefined;
  try {
    await admin.query(`create schema ${schema}`);
    p = new pg.Pool({
      connectionString: url,
      options: `-c search_path=${schema},public`
    });
    await p.query(`create table usuarios(id uuid primary key,ativo boolean,nome text,telefone text,atualizado_em timestamptz);
   create table medicos(id uuid primary key,usuario_id uuid,nome_completo text,crm text,rqe text,atualizado_em timestamptz);
   create table auditoria(id uuid default gen_random_uuid(),acao text,entidade text,entidade_id uuid,dados_novos jsonb,criado_em timestamptz default now());`);
    const sql = await readFile(
      new URL(
        '../../scripts/migrations/20261009-assistente-contextual.sql',
        import.meta.url
      ),
      'utf8'
    );
    await p.query(sql);
    await p.query(sql);
    const med = '00000000-0000-4000-8000-000000000001',
      usr = '00000000-0000-4000-8000-000000000002';
    await p.query('insert into usuarios values($1,true,$2,$3,now())', [
      usr,
      'Médico X',
      '5511999991234'
    ]);
    await p.query('insert into medicos values($1,$2,$3,null,null,now())', [
      med,
      usr,
      'Médico X'
    ]);
    await p.query(`create table whatsapp_instancias(medico_id uuid,oficial boolean,status text);
      insert into whatsapp_instancias values('${med}',false,'conectado');`);
    let geracoes = 0,
      envios = 0;
    const gerenciador = new GerenciadorConversaOnboarding({} as any, {
      gerar: async () => {
        if (++geracoes === 1) throw Error('falha de geração');
        return ['Olá, sou Noto. Qual seu nome completo?'];
      }
    });
    const bootstrap = {
      pool: p,
      gerenciador,
      salvarEstado: async () => {},
      instanciaNome: 'assistente',
      enviar: {
        enviarTexto: async () => {
          envios++;
          return { sucesso: true };
        }
      }
    };
    await assert.rejects(
      iniciarAssistenteConectado(bootstrap, med),
      /falha de geração/
    );
    assert.equal(envios, 0);
    await p.query("update auditoria set criado_em=now()-interval '2 minutes'");
    await iniciarAssistenteConectado(bootstrap, med);
    assert.equal(
      envios,
      1,
      'falha antes do transporte permite preparação novamente'
    );
    await iniciarAssistenteConectado(bootstrap, med);
    assert.equal(envios, 1, 'confirmação impede repetir boas-vindas');
    const repo = new PostgresAssistente(p);
    await Promise.all(
      Array.from({ length: 5 }, () =>
        repo.enfileirar({
          medicoId: med,
          instancia: 'assistente',
          mensagemId: 'm1',
          texto: 'Roberto Santos, CRM 12345/RS'
        })
      )
    );
    await repo.enfileirar({
      medicoId: med,
      instancia: 'assistente',
      mensagemId: 'm2',
      texto: 'Por que informar CRM?'
    });
    const reservas = await Promise.all(
      Array.from({ length: 5 }, () => repo.reservar(med))
    );
    assert.equal(reservas.filter(Boolean).length, 1);
    const r = reservas.find(Boolean)!;
    assert.equal(r.turno.mensagem_id, 'm1');
    const aplicado = await repo.aplicar(
      r,
      { nomeConfirmado: 'Roberto Santos', crmInformado: '12345/RS' },
      {
        intencao: 'registrar',
        ritmo: 'manter',
        assunto: 'cadastro',
        acoes: []
      },
      []
    );
    assert.equal(aplicado.nomeConfirmado, 'Roberto Santos');
    assert.equal(
      (await p.query('select crm from medicos')).rows[0].crm,
      '12345/RS'
    );
    await repo.prepararResposta(r, ['CRM salvo.']);
    await repo.iniciarEnvio(r);
    await repo.confirmarMensagem(r, 1);
    await repo.concluir(r);
    await repo.liberar(r);
    const r2 = (await repo.reservar(med))!;
    assert.equal(r2.turno.mensagem_id, 'm2');
    const h = await repo.historico(med, r2.turno.sequencia);
    assert.ok(h.some((x) => x.texto === 'CRM salvo.'));
    await repo.aplicar(
      r2,
      {},
      {
        intencao: 'esclarecer',
        ritmo: 'manter',
        assunto: 'explicar',
        acoes: []
      },
      []
    );
    await repo.prepararResposta(r2, ['Explicação.']);
    await repo.iniciarEnvio(r2);
    await p.query(
      "update noto_assistente_sessoes set reservado_em=now()-interval '10 minutes'"
    );
    await repo.enfileirar({
      medicoId: med,
      instancia: 'assistente',
      mensagemId: 'm3',
      texto: 'Voltei'
    });
    const r3 = await repo.reservar(med);
    assert.equal(r3?.turno.mensagem_id, 'm3');
    assert.equal(
      (
        await p.query(
          'select estado from noto_assistente_turnos where mensagem_id=$1',
          ['m2']
        )
      ).rows[0].estado,
      'incerto'
    );
    await assert.rejects(repo.confirmarMensagem(r2, 1), /RESERVA/);
    // Falha na última escrita precisa desfazer também nome/CRM e versão da sessão.
    await p.query(`create function falhar_turno() returns trigger language plpgsql as $$ begin
      if new.decisao->>'assunto'='falha sintetica' then raise exception 'falha sintetica'; end if;return new;end $$;
      create trigger falhar_turno before update on noto_assistente_turnos for each row execute function falhar_turno();`);
    await assert.rejects(
      repo.aplicar(
        r3!,
        { crmInformado: '54321/RS' },
        {
          intencao: 'registrar',
          ritmo: 'manter',
          assunto: 'falha sintetica',
          acoes: []
        },
        []
      ),
      /falha sintetica/
    );
    assert.equal(
      (await p.query('select crm from medicos')).rows[0].crm,
      '12345/RS'
    );
    assert.equal(
      (await p.query('select versao from noto_assistente_sessoes')).rows[0]
        .versao,
      r3!.versao
    );
    await repo.aplicar(
      r3!,
      {},
      { intencao: 'pausar', ritmo: 'pausar', assunto: 'pausa', acoes: [] },
      []
    );
    assert.equal(r3!.estado.pausado, true);
    await repo.falhar(r3!);
    await repo.liberar(r3!);
    assert.equal(
      await repo.reservar(med),
      null,
      'backoff bloqueia mensagens posteriores'
    );
    await p.query(
      "update noto_assistente_turnos set proxima_tentativa_em=now() where mensagem_id='m3'"
    );
    const retomado = (await repo.reservar(med))!;
    assert.equal(
      retomado.turno.estado,
      'aplicado',
      'retoma redação sem repetir gravação'
    );
    assert.equal(retomado.estado.pausado, true);
    await repo.prepararResposta(retomado, [
      'Primeira confirmada.',
      'Segunda incerta.'
    ]);
    await repo.iniciarEnvio(retomado);
    await repo.confirmarMensagem(retomado, 1);
    await repo.falhar(retomado);
    await repo.liberar(retomado);
    const historico = await repo.historico(med, '999999');
    assert.ok(historico.some((x) => x.texto === 'Primeira confirmada.'));
    assert.ok(!historico.some((x) => x.texto === 'Segunda incerta.'));
    assert.ok(historico.length <= 20);
    await repo.registrarApresentacao(
      med,
      { etapa: 'apresentacao' },
      ['Olá.'],
      'assistente',
      'bem-vindo'
    );
    assert.equal(
      (await p.query('select estado from noto_assistente_sessoes')).rows[0]
        .estado.pausado,
      true,
      'bootstrap tardio preserva progresso'
    );
  } finally {
    if (p) await p.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
