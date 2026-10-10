import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
test('revisão e aprovação exigem sessão e não aceitam identidade escolhida no corpo',async t=>{
 const modulo=await import('./router-painel.js').catch(()=>null);assert.ok(modulo,'rota de revisão deve existir');
 const aprovados:any[]=[];const app=express();app.use(express.json());app.use('/api/conta/cadastro',modulo.criarRouterCadastroPainel({
  autenticar:async(token:string)=>token==='valido'?'auth':null,
  pool:{query:async(_s:string,p:any[])=>{assert.equal(p[0],'auth');return {rows:[{id:'medico-sessao'}]};}} as any,
  repo:{revisaoPainel:async(id:string)=>{assert.equal(id,'medico-sessao');return {aprovado:false};},aprovarPainel:async(id:string,body:any)=>{aprovados.push({id,body});return {aprovado:true};}} as any
 }));
 const server=await new Promise<any>(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});t.after(()=>{server.closeAllConnections();server.close();});
 const url=`http://127.0.0.1:${server.address().port}/api/conta/cadastro`;
 assert.equal((await fetch(url)).status,401);
 const headers={Authorization:'Bearer valido','Content-Type':'application/json'};
 assert.equal((await fetch(url+'?medicoId=outro',{headers})).status,200);
 const body={trabalhoId:'34db784e-c454-4a5d-8ee5-7264c9f925b2',versao:'v1',nome:'Ana de Souza',crm:'37341/RS',rqe:null};
 assert.equal((await fetch(url+'/aprovar',{headers,method:'POST',body:JSON.stringify({...body,medicoId:'outro'})})).status,400);
 assert.equal((await fetch(url+'/aprovar',{headers,method:'POST',body:JSON.stringify({...body,crm:'sim'})})).status,400);
 assert.equal((await fetch(url+'/aprovar',{headers,method:'POST',body:JSON.stringify(body)})).status,200);
 assert.equal(aprovados.length,1);assert.equal(aprovados[0].id,'medico-sessao');
});
