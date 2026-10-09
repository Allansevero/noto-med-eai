import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { PostgresCadastro } from './postgres-cadastro.js';
const url=process.env.NOTO_TEST_DATABASE_URL;
if(!url || !['localhost','127.0.0.1'].includes(new URL(url).hostname) || !new URL(url).pathname.includes('test'))throw Error('Use banco local dedicado em NOTO_TEST_DATABASE_URL');
test('cadastro persistente: idempotência, concorrência, retentativas e alteração de certificado/perfil',async(t)=>{
 const admin=new pg.Pool({connectionString:url});const schema='cadastro_'+Date.now();let pool:pg.Pool|undefined;
 try{
  await admin.query(`create schema ${schema}`);pool=new pg.Pool({connectionString:url,options:`-c search_path=${schema},public`});
  await pool.query(`create table medicos(id uuid primary key,nome_completo text,crm text,usuario_id uuid,atualizado_em timestamptz);
   create table usuarios(id uuid primary key,nome text,telefone text,ativo boolean);
   create table medico_certificados(id uuid primary key,medico_id uuid references medicos(id),status text,criado_em timestamptz default now());
   create table noto_assistente_sessoes(medico_id uuid,estado jsonb);`);
  const sql=await readFile(new URL('../../scripts/migrations/20261009-cadastro-certificado.sql',import.meta.url),'utf8');await pool.query(sql);await pool.query(sql);
  const repo=new PostgresCadastro(pool);const mid=randomUUID(),uid=randomUUID(),cid=randomUUID();
  await pool.query('insert into usuarios values($1,$2,$3,true)',[uid,'Emmy','5551999999999']);
  await pool.query("insert into medicos values($1,'Médico X',null,$2,now())",[mid,uid]);
  await pool.query("insert into medico_certificados(id,medico_id,status) values($1,$2,'ativo')",[cid,mid]);
  await t.test('agendamento duplicado e reserva concorrente',async()=>{
   await Promise.all([repo.agendar({medicoId:mid,certificadoId:cid,documentoTitular:'11222333000181'}),repo.agendar({medicoId:mid,certificadoId:cid,documentoTitular:'11222333000181'})]);
   assert.equal((await pool!.query('select * from cadastro_certificado_trabalhos')).rows.length,1);
   const rs=await Promise.all([repo.reservar(),repo.reservar()]);assert.equal(rs.filter(Boolean).length,1);
   await repo.aplicar(rs.find(Boolean)!,{estado:'aguardando_confirmacao',dados:{pendencia:{id:randomUUID(),tipo:'nome',candidatos:[],perguntaConfirmada:null}}});
   assert.equal((await repo.pendencia(mid))?.dados.pendencia?.tipo,'nome');
  });
  await t.test('reserva expirada é recuperada e resultado atrasado perde autoridade',async()=>{
   await pool!.query("update cadastro_certificado_trabalhos set estado='pendente'");const antiga=(await repo.reservar())!;
   await pool!.query("update cadastro_certificado_trabalhos set reservado_em=now()-interval '10 minutes'");const nova=(await repo.reservar())!;
   assert.notEqual(antiga.token,nova.token);await repo.aplicar(antiga,{estado:'concluido',dados:{},crm:'999/RS'});
   assert.equal((await pool!.query('select crm from medicos')).rows[0].crm,null);
   await repo.aplicar(nova,{estado:'concluido',dados:{},crm:'37341/RS'});assert.equal((await pool!.query('select crm from medicos')).rows[0].crm,'37341/RS');
  });
  await t.test('edição manual durante consulta não é sobrescrita',async()=>{
   await pool!.query("update cadastro_certificado_trabalhos set estado='pendente',snapshot=jsonb_build_object('nome','Médico X','crm','37341/RS')");const r=(await repo.reservar())!;
   await pool!.query("update medicos set nome_completo='Maria Souza',crm='12345/SP'");await repo.aplicar(r,{estado:'concluido',dados:{nomeConfirmado:'Outro Nome'},nome:'Outro Nome',crm:'888/RS'});
   assert.deepEqual((await pool!.query('select nome_completo,crm from medicos')).rows[0],{nome_completo:'Maria Souza',crm:'12345/SP'});
  });
  await t.test('certificado substituído torna trabalho antigo obsoleto',async()=>{
   await pool!.query("update cadastro_certificado_trabalhos set estado='pendente'");const r=(await repo.reservar())!;
   await pool!.query("update medico_certificados set status='vencido' where id=$1",[cid]);await repo.aplicar(r,{estado:'concluido',dados:{},nome:'Outro Nome'});
   assert.equal((await pool!.query('select estado from cadastro_certificado_trabalhos')).rows[0].estado,'obsoleto');
  });
  await t.test('falha cadastral faz três tentativas antes de liberar coleta mínima',async()=>{
   await pool!.query("update medico_certificados set status='ativo' where id=$1",[cid]);
   await pool!.query("update cadastro_certificado_trabalhos set estado='pendente',tentativas=0,reserva=null,snapshot=jsonb_build_object('nome','Maria Souza','crm','12345/SP')");
   for(let n=1;n<=3;n++){
    await pool!.query('update cadastro_certificado_trabalhos set proxima_tentativa_em=now()');const r=(await repo.reservar())!;
    await repo.aplicar(r,{estado:'retentar',dados:{},codigo:'INDISPONIVEL'});
    const tr=(await pool!.query('select * from cadastro_certificado_trabalhos')).rows[0];assert.equal(tr.tentativas,n);assert.equal(Boolean(tr.dados.cadastroIndisponivel),n===3);
   }
  });
  await t.test('backfill agenda certificado atual uma vez sem importar notas',async()=>{
   const novo=randomUUID();await pool!.query("insert into medico_certificados(id,medico_id,status) values($1,$2,'ativo')",[novo,mid]);
   await repo.agendarAtivos();await repo.agendarAtivos();assert.equal((await pool!.query('select * from cadastro_certificado_trabalhos where certificado_id=$1',[novo])).rows.length,1);
  });
 }finally{await pool?.end();await admin.query(`drop schema ${schema} cascade`);await admin.end();}
});
