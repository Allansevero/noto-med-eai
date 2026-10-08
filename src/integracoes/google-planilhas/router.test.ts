import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {criarRouterGooglePlanilhas} from './router.js';
async function fixture(op:{ativo?:boolean;autenticado?:boolean;appId?:string}={}){
 const chamadas:any[]=[];
 const pool={query:async(sql:string,args:any[])=>{chamadas.push({sql,args});if(sql.startsWith('insert into google_planilhas_conexoes'))return {rows:[{versao:1}]};if(sql.includes('from medicos'))return {rows:[{id:'medico-real'}]};return {rows:[]};},connect:async()=>({query:pool.query,release(){}})}as any;
 const google={urlAutorizacao:(s:string,c:string)=>`https://accounts.google.com/o/oauth2/v2/auth?state=${s}&code_challenge=${c}`}as any;
 const app=express();app.use(express.json());app.use('/api/integracoes/google-planilhas',criarRouterGooglePlanilhas({pool,google:op.ativo===false?undefined:google,mapeador:{mapear:async()=>({nome:null,cpf:null,email:null,telefone:0})},autenticar:async token=>op.autenticado===false?null:token==='sessao-valida'?'auth-real':null,encryptionKey:'test',pepper:'test',redirectUri:'https://noto.example/api/integracoes/google-planilhas/callback',googleApiKey:'chave',googleAppId:op.appId}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address()as any).port}/api/integracoes/google-planilhas`;
 return {base,chamadas,close:()=>new Promise<void>(r=>server.close(()=>r()))};
}
test('conexão exige sessão válida, não confia em medicoId do cliente',async()=>{const f=await fixture();try{const r=await fetch(f.base+'/conectar',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({medicoId:'outra-pessoa'})});assert.equal(r.status,401);assert.equal(f.chamadas.length,0);}finally{await f.close();}});
test('conta autenticada vê indisponibilidade sem derrubar restante da aplicação',async()=>{const f=await fixture({ativo:false});try{const r=await fetch(f.base+'/status',{headers:{Authorization:'Bearer sessao-valida'}});assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true,configurado:false,conectado:false});}finally{await f.close();}});
test('OAuth usa médico da sessão, cookie HttpOnly e PKCE, nunca token na URL',async()=>{const f=await fixture();try{const r=await fetch(f.base+'/conectar',{method:'POST',headers:{Authorization:'Bearer sessao-valida','Content-Type':'application/json'},body:JSON.stringify({medicoId:'outra-pessoa'})});assert.equal(r.status,200);const data:any=await r.json();assert.match(data.url,/code_challenge=/);assert.match(r.headers.get('set-cookie')??'',/HttpOnly/);assert.match(r.headers.get('set-cookie')??'',/SameSite=Lax/);assert.ok(f.chamadas.some(c=>c.args?.includes('medico-real')));assert.equal(f.chamadas.some(c=>c.args?.includes('outra-pessoa')),false);}finally{await f.close();}});
test('callback sem cookie do browser não aceita estado e não troca credenciais',async()=>{const f=await fixture();try{const r=await fetch(f.base+'/callback?state=forjado&code=falso',{redirect:'manual'});assert.equal(r.status,302);assert.match(r.headers.get('location')??'',/google_planilhas=erro/);assert.equal(f.chamadas.length,0);}finally{await f.close();}});

test('callback superado não revoga o grant de uma conexão mais recente', async()=>{
 const chamadas:string[]=[];
 const pool={query:async(sql:string)=>{
  chamadas.push(sql);
  if(sql.startsWith('delete from google_planilhas_oauth'))return {rows:[{medico_id:'medico-real',versao:1,verificador:'verificador'}]};
  // Another connection has already advanced the version while Google exchanged the code.
  if(sql.startsWith('update google_planilhas_conexoes'))return {rows:[]};
  throw Error('SQL inesperado');
 }} as any;
 let trocas=0,revogacoes=0;
 const google={trocarCodigo:async(codigo:string,verificador:string)=>{
  assert.equal(codigo,'codigo-antigo');assert.equal(verificador,'verificador');trocas++;
  return {accessToken:'token-antigo',refreshToken:'refresh-antigo',expiraEm:Date.now()+3600000};
 },revogar:async()=>{revogacoes++;}} as any;
 const app=express();
 app.use('/api/integracoes/google-planilhas',criarRouterGooglePlanilhas({pool,google,autenticar:async()=>null,encryptionKey:'test',pepper:'test',redirectUri:'https://noto.example/api/integracoes/google-planilhas/callback'}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{
  const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}/api/integracoes/google-planilhas/callback?state=estado-antigo&code=codigo-antigo`,{headers:{Cookie:'noto_google_estado=estado-antigo'},redirect:'manual'});
  assert.equal(response.status,302);assert.match(response.headers.get('location')??'',/google_planilhas=erro/);
  assert.equal(trocas,1);assert.equal(chamadas.length,2);assert.equal(revogacoes,0);
 }finally{await new Promise<void>(r=>server.close(()=>r()));}
});

test('Picker recusa nome do projeto antes de obter token',async()=>{
 const f=await fixture({appId:'noto-integrations'});try{
 const r=await fetch(f.base+'/picker-token',{headers:{Authorization:'Bearer sessao-valida'}});
 assert.equal(r.status,503);const data:any=await r.json();assert.match(data.detalhe,/número do projeto/);
 assert.equal(f.chamadas.some(c=>c.sql.includes('pgp_sym_decrypt')),false);
 }finally{await f.close();}
});

for (const cenario of ['cabecalho', 'groq', 'banco'] as const) {
 test(`prévia identifica falha de ${cenario} sem expor dados`, async()=>{
  const logs:unknown[]=[];const warn=console.warn;console.warn=(...args:unknown[])=>{logs.push(args);};
  const pool={query:async(sql:string)=>{
   if(sql.includes('from medicos'))return {rows:[{id:'medico-real'}]};
   if(sql.includes('pgp_sym_decrypt(access_token'))return {rows:[{versao:1,access_token:'token-secreto',expira_em:new Date(Date.now()+3600000)}]};
   if(sql.includes('for update'))return {rows:[{versao:1,conectado:true}]};
   if(sql.startsWith('insert into google_planilhas_previas'))throw Object.assign(new Error('segredo: conteúdo do banco'),{code:'42P01'});
   return {rows:[]};
  },connect:async()=>({query:pool.query,release(){}})} as any;
  const google={abas:async()=>({titulo:'privado',abas:[{id:12,titulo:'privado',linhas:10,colunas:2}]}),ler:async()=>({valores:cenario==='cabecalho'?[['Agenda']]:[['Nome','Telefone'],['Paciente privado','51999999999']],limitado:false})} as any;
  const app=express();app.use(express.json());app.use('/planilhas',criarRouterGooglePlanilhas({pool,google,encryptionKey:'chave-secreta',pepper:'segredo',redirectUri:'https://example.test/callback',autenticar:async()=> 'usuario',mapeador:{mapear:async()=>{
   if(cenario==='groq')throw Error('Não foi possível mapear colunas (Groq HTTP 400).');
   return {nome:0,telefone:1,cpf:null,email:null};
  }}}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  try{
   const response=await fetch(`http://127.0.0.1:${(server.address() as any).port}/planilhas/previa`,{method:'POST',headers:{Authorization:'Bearer segredo','Content-Type':'application/json'},body:JSON.stringify({planilha:'planilha_12345',abaId:12})});
   const data:any=await response.json();
   assert.equal(response.status,cenario==='cabecalho'?422:502);
   assert.equal(data.diagnostico.rota,'/previa');
   assert.equal(data.diagnostico.etapa,cenario==='banco'?'salvar_previa':'extrair_pacientes');
   if(cenario==='cabecalho')assert.equal(data.diagnostico.codigo,'CABECALHO_NAO_IDENTIFICADO');
   if(cenario==='groq')assert.equal(data.diagnostico.statusHttp,400);
   if(cenario==='banco')assert.equal(data.diagnostico.codigoBanco,'42P01');
   assert.doesNotMatch(JSON.stringify([data,logs]),/segredo|secreto|privado|chave-secreta/);
  }finally{console.warn=warn;await new Promise<void>(r=>server.close(()=>r()));}
 });
}
