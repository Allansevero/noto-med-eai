import type pg from 'pg';
import { randomUUID } from 'node:crypto';
import { nomeProfissionalValido, normalizarCrm } from '../conta/validar-dados-emissao.js';
import { criarPendencia, type DadosCadastro, type PerfilCadastro, type ResultadoEnriquecimento } from './enriquecer-cadastro.js';
export interface TrabalhoCadastro { id:string; medico_id:string; certificado_id:string; documento_titular:string|null; estado:string; dados:DadosCadastro; snapshot:{nome:string;crm:string|null}; tentativas:number }
export interface ReservaCadastro { trabalho:TrabalhoCadastro; token:string; perfil:PerfilCadastro }
export class PostgresCadastro {
 constructor(readonly pool:pg.Pool){}
 async transacao<T>(fn:(c:pg.PoolClient)=>Promise<T>):Promise<T>{const c=await this.pool.connect();try{await c.query('begin');const r=await fn(c);await c.query('commit');return r;}catch(e){await c.query('rollback');throw e;}finally{c.release();}}
 async agendar(e:{medicoId:string;certificadoId:string;documentoTitular?:string}):Promise<void>{
  await this.pool.query(`insert into cadastro_certificado_trabalhos(medico_id,certificado_id,documento_titular,snapshot)
   select m.id,c.id,$3,jsonb_build_object('nome',m.nome_completo,'crm',m.crm) from medicos m join medico_certificados c on c.medico_id=m.id
   where m.id=$1 and c.id=$2 and c.status='ativo' on conflict(certificado_id) do nothing`,[e.medicoId,e.certificadoId,e.documentoTitular??null]);
 }
 async agendarAtivos():Promise<void>{
  await this.pool.query(`insert into cadastro_certificado_trabalhos(medico_id,certificado_id,snapshot)
   select m.id,c.id,jsonb_build_object('nome',m.nome_completo,'crm',m.crm) from medicos m join usuarios u on u.id=m.usuario_id and u.ativo=true
   join medico_certificados c on c.medico_id=m.id and c.status='ativo'
   where not exists(select 1 from medico_certificados n where n.medico_id=m.id and n.status='ativo' and (n.criado_em,n.id)>(c.criado_em,c.id))
   on conflict(certificado_id) do nothing`);
 }
 async invalidarObsoletos():Promise<void>{await this.pool.query(`update cadastro_certificado_trabalhos t set estado='obsoleto',reserva=null,atualizado_em=now()
  where t.estado not in ('obsoleto','concluido') and not exists(select 1 from medico_certificados c join medicos m on m.id=c.medico_id join usuarios u on u.id=m.usuario_id
   where c.id=t.certificado_id and c.medico_id=t.medico_id and c.status='ativo' and u.ativo=true
   and not exists(select 1 from medico_certificados n where n.medico_id=m.id and n.status='ativo' and (n.criado_em,n.id)>(c.criado_em,c.id)))`);}
 async reservar():Promise<ReservaCadastro|null>{
  await this.invalidarObsoletos();return this.transacao(async c=>{
   const r=(await c.query(`select * from cadastro_certificado_trabalhos where estado in ('pendente','consultando') and proxima_tentativa_em<=now()
    and (reserva is null or reservado_em<now()-interval '3 minutes') order by criado_em,id for update skip locked limit 1`)).rows[0] as TrabalhoCadastro|undefined;
   if(!r)return null;const token=randomUUID();
   const m=(await c.query('select nome_completo,crm from medicos where id=$1',[r.medico_id])).rows[0];
   const legado=(await c.query('select estado from noto_assistente_sessoes where medico_id=$1',[r.medico_id])).rows[0]?.estado;
   r.tentativas++;await c.query("update cadastro_certificado_trabalhos set estado='consultando',reserva=$2,reservado_em=now(),tentativas=$3 where id=$1",[r.id,token,r.tentativas]);
   return {trabalho:r,token,perfil:{nome:m.nome_completo,crm:m.crm,nomeConfirmado:nomeProfissionalValido(m.nome_completo)&&legado?.nomeConfirmado===m.nome_completo&&legado?.identidadePendente!==true}};
  });
 }
 async documento(r:ReservaCadastro,documento:string|undefined):Promise<void>{await this.pool.query('update cadastro_certificado_trabalhos set documento_titular=$3 where id=$1 and reserva=$2',[r.trabalho.id,r.token,documento??null]);r.trabalho.documento_titular=documento??null;}
 async aplicar(r:ReservaCadastro,resultado:ResultadoEnriquecimento):Promise<void>{
  await this.transacao(async c=>{
   const t=(await c.query('select * from cadastro_certificado_trabalhos where id=$1 and reserva=$2 for update',[r.trabalho.id,r.token])).rows[0] as TrabalhoCadastro|undefined;
   if(!t)return;
   const m=(await c.query('select nome_completo,crm from medicos where id=$1 for update',[t.medico_id])).rows[0];
   const ativo=(await c.query("select id from medico_certificados where medico_id=$1 and status='ativo' order by criado_em desc,id desc limit 1 for update",[t.medico_id])).rows[0];
   if(ativo?.id!==t.certificado_id){await c.query("update cadastro_certificado_trabalhos set estado='obsoleto',reserva=null where id=$1",[t.id]);return;}
   if(m.nome_completo!==t.snapshot.nome || m.crm!==t.snapshot.crm){
    const dados={...t.dados};delete dados.pendencia;if(m.nome_completo!==t.snapshot.nome)delete dados.nomeConfirmado;
    await c.query("update cadastro_certificado_trabalhos set estado='pendente',reserva=null,tentativas=0,snapshot=$2,dados=$3,diagnostico='CADASTRO_ALTERADO',proxima_tentativa_em=now() where id=$1",[t.id,JSON.stringify({nome:m.nome_completo,crm:m.crm}),JSON.stringify(dados)]);return;
   }
   if(resultado.nome && !nomeProfissionalValido(resultado.nome))throw Error('NOME_INVALIDO');
   if(resultado.crm && !normalizarCrm(resultado.crm))throw Error('CRM_INVALIDO');
   if(resultado.nome || (resultado.crm&&!normalizarCrm(m.crm))){
    await c.query('update medicos set nome_completo=coalesce($2,nome_completo),crm=coalesce($3,crm),atualizado_em=now() where id=$1',[t.medico_id,resultado.nome??null,normalizarCrm(m.crm)?null:resultado.crm??null]);
    // O interlocutor pode ser secretário: nunca mudar automaticamente usuarios.nome.
   }
   let dados=resultado.dados;let estado:string=resultado.estado;let espera=0;
   if(estado==='retentar'){
    if(t.tentativas<3){estado='pendente';espera=t.tentativas===1?30:120;}
    else{estado='pendente';dados={...dados,cadastroIndisponivel:true};if(dados.nomeConfirmado){estado='aguardando_confirmacao';dados.pendencia=criarPendencia('crm');}}
   }
   await c.query(`update cadastro_certificado_trabalhos set estado=$2,dados=$3,reserva=null,reservado_em=null,diagnostico=$4,
    proxima_tentativa_em=now()+$5*interval '1 second',snapshot=$6,atualizado_em=now() where id=$1`,[t.id,estado,JSON.stringify(dados),resultado.codigo??null,espera,JSON.stringify({nome:resultado.nome??m.nome_completo,crm:resultado.crm??m.crm})]);
  });
 }
 async pendencia(medicoId:string):Promise<TrabalhoCadastro|null>{const r=await this.pool.query(`select t.* from cadastro_certificado_trabalhos t join medico_certificados c on c.id=t.certificado_id
  join medicos m on m.id=t.medico_id join usuarios u on u.id=m.usuario_id and u.ativo=true where t.medico_id=$1 and t.estado='aguardando_confirmacao' and c.status='ativo'
  and not exists(select 1 from medico_certificados n where n.medico_id=m.id and n.status='ativo' and (n.criado_em,n.id)>(c.criado_em,c.id)) order by t.criado_em desc limit 1`,[medicoId]);return r.rows[0]??null;}
}
