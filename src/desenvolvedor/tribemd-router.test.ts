import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarRouterTribemdDesenvolvedor } from './tribemd-router.js';
import { ErroTribemd } from './tribemd-navegador.js';
const token='chave-desenvolvedor-de-teste-1234567890';
async function ambiente(t:any,opcoes:{ativo?:boolean;falhaLogin?:boolean;espera?:Promise<void>}={}){
 let criados=0,fechados=0,logins=0;const logs:any[]=[];
 const app=express();app.use(express.json());app.use('/api',criarRouterTribemdDesenvolvedor({ativo:opcoes.ativo??true,token,configurado:true,
  registrar:e=>logs.push(e),decisor:{async decidir(){return null;}},async criarNavegador(){criados++;return {async entrar(){logins++;if(opcoes.espera)await opcoes.espera;if(opcoes.falhaLogin)throw new ErroTribemd('LOGIN_NAO_CONFIRMADO','Login não confirmado.',{etapa:'confirmando_login',pagina:'login',statusHttp:200});},async executar(){},async encerrar(){fechados++;},async ler(){return {tela:{url:'https://app.tribemd.com/pacientes',campos:[{rotulo:'Nome completo',valor:'Ana'},{rotulo:'CPF',valor:'52998224725'}],tabelas:[]},opcoes:[],diagnostico:{caminho:'/pacientes',tabelas:0,linhas:0,campos:['nome','cpf'],limitada:false}};}};}}));
 const server=await new Promise<any>(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 t.after(()=>new Promise<void>(r=>{server.closeAllConnections();server.close(()=>r());}));
 const pedir=async(path:string,method='GET',body?:unknown,chave=token)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{Authorization:'Bearer '+chave,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};};
 const corpo={email:'teste@example.com',senha:'segredo',inicio:'2026-10-07',fim:'2026-10-14'};
 const aguardar=async(id:string)=>{for(let i=0;i<100;i++){const r=await pedir('/sessoes/'+id);if(!['preparando','autenticando','investigando'].includes(r.data.estado))return r;await new Promise<void>(r=>setImmediate(r));}throw Error('Não terminou');};
 return {pedir,corpo,aguardar,logs,criados:()=>criados,fechados:()=>fechados,logins:()=>logins};
}
test('área inativa ou chave incorreta não inicia navegador',async t=>{
 for(const ativo of [false,true]){const a=await ambiente(t,{ativo});assert.equal((await a.pedir('/sessoes','POST',a.corpo,'errada')).status,ativo?401:404);assert.equal(a.criados(),0);}
});
test('sessão extrai JSON, fecha navegador e não expõe credenciais em resultado ou logs',async t=>{
 const a=await ambiente(t),s=await a.pedir('/sessoes','POST',a.corpo);assert.equal(s.status,202);
 const r=await a.aguardar(s.data.sessaoId);assert.equal(r.data.resultado.pacientes[0].cpf,'52998224725');assert.equal(a.fechados(),1);
 assert.ok(!JSON.stringify(r.data).includes('segredo'));assert.ok(!JSON.stringify(a.logs).includes('teste@example.com'));assert.ok(!JSON.stringify(a.logs).includes('52998224725'));
 assert.equal((await a.pedir('/sessoes/'+s.data.sessaoId,'DELETE')).status,202);assert.equal((await a.pedir('/sessoes/'+s.data.sessaoId)).status,410);
});
test('falha de login fica clara e não é repetida automaticamente',async t=>{
 const a=await ambiente(t,{falhaLogin:true}),s=await a.pedir('/sessoes','POST',a.corpo),r=await a.aguardar(s.data.sessaoId);
 assert.equal(r.data.estado,'necessita_intervencao');assert.equal(r.data.diagnostico.codigo,'LOGIN_NAO_CONFIRMADO');assert.equal(r.data.diagnostico.etapa,'confirmando_login');assert.equal(r.data.diagnostico.statusHttp,200);assert.equal(a.logins(),1);assert.equal(a.fechados(),1);
 await a.pedir('/sessoes/'+s.data.sessaoId,'DELETE');
});
test('reserva impede sessões concorrentes e intervalo inválido não faz login',async t=>{
 let resolver!:()=>void;const espera=new Promise<void>(r=>{resolver=r;});const a=await ambiente(t,{espera});
 assert.equal((await a.pedir('/sessoes','POST',{...a.corpo,inicio:'2026-02-30'})).status,400);
 const s=await a.pedir('/sessoes','POST',a.corpo);assert.equal((await a.pedir('/sessoes','POST',a.corpo)).status,429);resolver();await a.aguardar(s.data.sessaoId);await a.pedir('/sessoes/'+s.data.sessaoId,'DELETE');
});
