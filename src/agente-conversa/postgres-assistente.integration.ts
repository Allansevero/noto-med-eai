import assert from 'node:assert/strict';
import { test } from 'node:test';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { iniciarAssistenteConectado } from './iniciar-assistente-conectado.js';
import { GerenciadorConversaOnboarding } from './gerenciador-conversa-onboarding.js';
import { PostgresAtendimentoRepositorio } from '../io/postgres/postgres-atendimento-repositorio.js';
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
test('reserva concorrente, gravação atômica, ordem, histórico e envio incerto em PostgreSQL real', async (t) => {
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
    await repo.falhar(r3!, 'redigir:IA_HTTP_ERRO_429');
    assert.equal((await p.query("select diagnostico from noto_assistente_turnos where mensagem_id='m3'")).rows[0].diagnostico, 'redigir:IA_HTTP_ERRO_429');
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
    await p.query(`create table pacientes(id uuid,medico_id uuid);
      create table solicitacoes_nota(id uuid,medico_id uuid,status text,criado_em timestamptz);`);
    const criarMedico = async (n: number) => {
      const id = '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
      const u = '00000000-0000-4000-8000-' + String(n + 100).padStart(12, '0');
      await p!.query('insert into usuarios values($1,true,$2,$3,now())', [
        u,
        'Médico X',
        '5511999991234'
      ]);
      await p!.query('insert into medicos values($1,$2,$3,$4,null,now())', [
        id,
        u,
        'Médico X',
        '12345/RS'
      ]);
      return id;
    };
    await t.test(
      'revisão: conversa legada concluída preserva progresso sem usar nome provisório',
      async () => {
        const id = await criarMedico(10);
        await p!.query(
          `insert into auditoria(acao,entidade,entidade_id,dados_novos) values('estado_onboarding_assistente','medicos',$1,'{"etapa":"concluido","janelaDataCorte":"2026-01-01"}')`,
          [id]
        );
        await repo.enfileirar({
          medicoId: id,
          instancia: 'assistente',
          mensagemId: 'legado',
          texto: 'Olá'
        });
        const r = (await repo.reservar(id))!;
        const estado = await repo.aplicar(
          r,
          {},
          {
            intencao: 'responder',
            ritmo: 'manter',
            assunto: 'conversa',
            acoes: []
          },
          []
        );
        assert.equal(estado.etapa, 'concluido');
        assert.equal(estado.nomeConfirmado, undefined);
        assert.equal(estado.identidadePendente, true);
        await repo.liberar(r);
      }
    );
    await t.test(
      'revisão: perfil editado fora da conversa é o cadastro atual do contexto',
      async () => {
        const id = await criarMedico(11);
        await p!.query(
          `insert into noto_assistente_sessoes(medico_id,estado) values($1,$2)`,
          [
            id,
            JSON.stringify({
              etapa: 'concluido',
              nomeConfirmado: 'Roberto Santos',
              crmInformado: '12345/RS',
              rqeInformado: null
            })
          ]
        );
        await p!.query(
          "update medicos set nome_completo='Maria Santos',crm='54321/SP',rqe='789' where id=$1",
          [id]
        );
        await repo.enfileirar({
          medicoId: id,
          instancia: 'assistente',
          mensagemId: 'perfil',
          texto: 'Qual CRM cadastrado?'
        });
        const r = (await repo.reservar(id))!;
        assert.equal(r.estado.crmInformado, '54321/SP');
        assert.equal(r.estado.rqeInformado, '789');
        assert.equal(r.estado.nomeConfirmado, 'Maria Santos');
        const panorama = await repo.panorama(id);
        assert.deepEqual(panorama.cadastro, {
          nome: 'Maria Santos',
          crm: '54321/SP',
          rqe: '789'
        });
        await repo.liberar(r);
      }
    );
    await t.test(
      'revisão: apresentação usa a mesma fila, não reinicia conversa nem perde confirmação parcial',
      async () => {
        const id = await criarMedico(12);
        await p!.query(
          "insert into whatsapp_instancias values($1,false,'conectado')",
          [id]
        );
        await p!.query(
          `insert into noto_assistente_sessoes(medico_id,estado) values($1,'{"etapa":"concluido","pausado":true}')`,
          [id]
        );
        assert.equal(
          await repo.enfileirarApresentacao(id, 'assistente'),
          false
        );
        const novo = await criarMedico(13);
        await p!.query(
          "insert into whatsapp_instancias values($1,false,'conectado')",
          [novo]
        );
        const insercoes = await Promise.all(
          Array.from({ length: 5 }, () =>
            repo.enfileirarApresentacao(novo, 'assistente')
          )
        );
        assert.equal(insercoes.filter(Boolean).length, 1);
        const r = (await repo.reservar(novo))!;
        assert.equal(r.turno.texto, '');
        await repo.aplicar(
          r,
          {},
          {
            intencao: 'responder',
            ritmo: 'manter',
            assunto: 'apresentação',
            acoes: []
          },
          []
        );
        await repo.prepararResposta(r, ['Sou Noto.', 'Qual seu nome?']);
        await repo.iniciarEnvio(r);
        await repo.confirmarMensagem(r, 1);
        await p!.query(
          "update noto_assistente_sessoes set reservado_em=now()-interval '10 minutes' where medico_id=$1",
          [novo]
        );
        assert.equal(await repo.reservar(novo), null);
        assert.deepEqual(await repo.historico(novo, '999999'), [
          { papel: 'noto', texto: 'Sou Noto.' }
        ]);
        assert.equal(
          await repo.enfileirarApresentacao(novo, 'assistente'),
          false
        );
      }
    );

    await t.test('telefone duplicado usa só conversa confirmada da instância e bloqueia ambiguidade real',async()=>{
      await p!.query('alter table medicos add column especialidade text;create table medico_servicos_fiscais(id uuid default gen_random_uuid(),medico_id uuid,ctrib_nac text,padrao boolean,ativo boolean);');
      const r=new PostgresAtendimentoRepositorio(p!,'chave teste');
      const outro=await criarMedico(14);
      await p!.query("update usuarios set telefone='5551981680978' where id in (select usuario_id from medicos where id=any($1::uuid[]))",[['00000000-0000-4000-8000-000000000013',outro]]);
      // Mesmo telefone: somente o cadastro 13 tem apresentação confirmada.
      const medico=(await r.buscarMedicoAssistentePorTelefone('5551981680978','assistente'))!;
      assert.equal(medico.id,'00000000-0000-4000-8000-000000000013');
      await p!.query("insert into medico_servicos_fiscais(medico_id,ctrib_nac,padrao,ativo) values($1,'041601',true,true),($1,'041601',true,true)",[medico.id]);
      assert.equal((await r.buscarMedicoAssistentePorTelefone('5551981680978','assistente'))?.id,medico.id,'serviços repetidos não duplicam médico');
      assert.equal(await r.buscarMedicoAssistentePorTelefone('5551981680978','outra-instancia'),null);
      await p!.query(`insert into noto_assistente_turnos(medico_id,instancia,mensagem_id,texto,estado,mensagens,confirmadas) values($1,'assistente','segunda-apresentacao','','concluido','["Oi."]',1)`,[outro]);
      assert.equal(await r.buscarMedicoAssistentePorTelefone('5551981680978','assistente'),null,'duas conversas confirmadas continuam ambíguas');
      await p!.query('update usuarios set ativo=false where id=(select usuario_id from medicos where id=$1)',[outro]);
      assert.equal((await r.buscarMedicoAssistentePorTelefone('5551981680978','assistente'))?.id,medico.id);
      await p!.query('update usuarios set ativo=false where id=(select usuario_id from medicos where id=$1)',[medico.id]);
      assert.equal(await r.buscarMedicoAssistentePorTelefone('5551981680978','assistente'),null,'não escolher cadastro inativo');
    });

    await t.test('webhook de data repetido não modifica outra nota pendente',async()=>{
      await p!.query(`create type fila_solicitacao_nota as enum('pronta','pendente_cadastro');
        alter table solicitacoes_nota add column xdesc_serv text,add column datas_consulta_texto text,add column aguardando_dados_profissionais boolean default false,
          add column aguardando_confirmacao_medico boolean default false,add column aguardando_data_consulta boolean default true,
          add column fila fila_solicitacao_nota,add column atualizado_em timestamptz,add column tentativas integer default 0,add column bloqueada_em timestamptz;
        create table notas_fiscais(solicitacao_id uuid);create table investigacoes_emissao(solicitacao_id uuid);`);
      const a='00000000-0000-4000-8000-000000000050',b='00000000-0000-4000-8000-000000000051';
      await p!.query("insert into solicitacoes_nota(id,medico_id,status,criado_em) values($1,$3,'pendente',now()),($2,$3,'pendente',now())",[a,b,med]);
      const r=new PostgresAtendimentoRepositorio(p!,'chave teste');
      const entrada={xdescServ:'REFERENTE A CONSULTA NAS DATAS 08/10/2026',fila:'pronta' as const,medicoId:med,mensagemId:'data-repetida',instancia:'assistente'};
      await r.atualizarDataDescricaoSolicitacao({...entrada,solicitacaoId:a});
      await r.atualizarDataDescricaoSolicitacao({...entrada,solicitacaoId:b});
      assert.equal((await p!.query('select aguardando_data_consulta from solicitacoes_nota where id=$1',[b])).rows[0].aguardando_data_consulta,true);
      assert.equal((await p!.query('select count(*)::int as total from auditoria where acao=$1',['resposta_data_assistente'])).rows[0].total,1);
    });
  } finally {
    if (p) await p.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
