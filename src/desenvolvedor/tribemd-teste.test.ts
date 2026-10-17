import express from 'express';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { BrowserContext } from 'playwright-core';
import { loginTribemd, agendaTribemd, constantesPublicasTribemd, headersRecursoPublicoTribemd, permitirRequisicaoTribemd, lerConsultas } from './tribemd-leitura.js';
import { PerfisTribemd } from './tribemd-perfil.js';
import { NavegadorTribemd, ErroTribemd } from './tribemd-navegador.js';
import { chromium } from 'playwright-core';
import { criarAreaTesteTribemd } from './tribemd-teste-router.js';
import { montarAreaTesteTribemd, caminhoTesteTribemd } from './tribemd-montar.js';
import { validarConfiguracaoTesteTribemd } from './tribemd-configuracao.js';

test('destinos de login e agenda usam a rota solicitada',()=>{
 assert.equal(loginTribemd,'https://app.tribemd.com/login?continue=/atendimentos/agenda');assert.equal(agendaTribemd,'/atendimentos/agenda');
});
test('bloqueia escritas, ações GET e documentos fora das duas páginas de leitura',()=>{
 const base='https://app.tribemd.com';
 assert.equal(permitirRequisicaoTribemd(base+'/api/usuarios/login','POST','fetch',true),true);
 assert.equal(permitirRequisicaoTribemd(base+'/api/usuarios/login','POST','fetch',false),false);
 assert.equal(permitirRequisicaoTribemd(base+'/api/auth/register','POST','fetch',true),false);
 for(const method of ['POST','PUT','DELETE','PATCH'])assert.equal(permitirRequisicaoTribemd(base+'/api/pacientes',''+method,'fetch',false),false);
 for(const path of ['/agenda','/pacientes/42/','/pacientes/42/prontuario','/api/pacientes/delete'])assert.equal(permitirRequisicaoTribemd(base+path,'GET','document',false),false);
 assert.equal(permitirRequisicaoTribemd(base+'/atendimentos/agenda','GET','document',false),true);
 assert.equal(permitirRequisicaoTribemd(base+'/inicio','GET','document',false),true);
 assert.equal(permitirRequisicaoTribemd('https://www.googletagmanager.com/gtag.js','GET','script',true),false);
});
test('não deduz última consulta a partir de consulta agendada ou data inválida',()=>{
 const r=lerConsultas([{colunas:['Paciente','Data','Status'],linhas:[['Exemplo','12/10/2026','agendado'],['Exemplo','31/02/2026','realizada'],['Exemplo','30/10/2026','realizada']]}],'2026-10-17');assert.equal(r.length,0);
});
test('distingue última consulta explícita de atendimento realizado observado e não mescla homônimos',()=>{
 const r=lerConsultas([{colunas:['Nome','Última consulta'],linhas:[['Exemplo','12/10/2026'],['Exemplo','13/10/2026']]},{colunas:['Paciente','Data','Situação'],linhas:[['Exemplo','14/10/2026','realizada']]}],'2026-10-17');
 assert.equal(r.length,3);assert.equal(r[0].evidencia,'coluna_ultima_consulta');assert.equal(r[2].evidencia,'consulta_realizada_observada');assert.equal(r[2].ultimaConsulta,null);assert.equal(r[2].dataConsultaObservada,'2026-10-14');
});
test('envelope criptografa senha/cookies e vincula clínica; bloqueio impede acesso concorrente',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tribemd-crypto-'));const chave=randomBytes(32).toString('base64'),p=new PerfisTribemd(dir,chave);
 try{
  const liberar=await p.bloquear('clinica-a');await assert.rejects(p.bloquear('clinica-a'),/PERFIL_OCUPADO/);
  await p.salvar('clinica-a',{email:'teste@example.invalid',senha:'segredo-ficticio',estado:{cookies:[],origins:[{origin:'https://app.tribemd.com',localStorage:[{name:'token',value:'cookie-ficticio'}]}]}});
  const arquivo=(await readdir(dir)).find(f=>f.endsWith('.enc'))!;const texto=await readFile(join(dir,arquivo),'utf8');
  assert.equal(texto.includes('segredo-ficticio')||texto.includes('cookie-ficticio')||texto.includes('teste@example.invalid'),false);
  assert.equal((await stat(join(dir,arquivo))).mode&0o777,0o600);
  assert.equal((await new PerfisTribemd(dir,chave).ler('clinica-a')).senha==='segredo-ficticio',true);
  assert.deepEqual(await p.ler('clinica-b'),{});
  await assert.rejects(new PerfisTribemd(dir,randomBytes(32).toString('base64')).ler('clinica-a'),/PERFIL_INTEGRA_INVALIDA/);
  await liberar();await p.esquecer('clinica-a');assert.deepEqual(await p.ler('clinica-a'),{});
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('área protege HTML/imagem, rejeita CSRF, não expõe credenciais e aceita limpeza de perfil',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tribemd-http-')),token=randomBytes(32).toString('hex');
 const externo=express(),server=externo.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const port=(server.address() as {port:number}).port,base=`http://127.0.0.1:${port}`;
 const area=criarAreaTesteTribemd({token,chave:randomBytes(32).toString('base64'),diretorio:dir,origem:base,chromium:'/inexistente'});externo.use(area.app);
 const headers={Authorization:'Basic '+Buffer.from('teste:'+token).toString('base64')};
 try{
  assert.equal((await fetch(base+'/',{})).status,401);
  assert.equal((await fetch(base+'/api/sessoes/id/tela',{})).status,401);
  const h=await fetch(base+'/',{headers});assert.equal(h.status,200);assert.equal(h.headers.get('cache-control'),'no-store');assert.equal((await h.text()).includes('Somente leitura.'),true);
  assert.equal((await fetch(base+'/api/sessoes',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{"clinica":"exemplo"}'})).status,403);
  const lista=await fetch(base+'/api/sessoes',{headers});assert.deepEqual(await lista.json(),{ok:true,sessoes:[]});
  const r=await fetch(base+'/api/perfis/exemplo',{method:'DELETE',headers:{...headers,Origin:base,'X-Tribemd-Teste':'1'}});assert.equal(r.status,200);
  assert.equal((await fetch(base+'/api/sessoes',{method:'POST',headers:{...headers,Origin:'https://malicioso.invalid','X-Tribemd-Teste':'1'}})).status,403);
 }finally{await area.encerrar();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
const executavel=process.env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium';
const xvfb=process.env.XVFB_EXECUTABLE_PATH||'Xvfb';
async function fixture(n:NavegadorTribemd,erro=false,exigirConstantes=false){
 const context=(n as unknown as {context:BrowserContext}).context;
 const chamadas:{metodo:string;rota:string}[]=[];
 await context.route('https://bipp.nyc3.cdn.digitaloceanspaces.com/bipp/static/constantes.json*',route=>route.fulfill({contentType:'application/json',headers:{'Access-Control-Allow-Origin':'https://app.tribemd.com'},body:'{"catalogoPublico":true}'}));
 await context.route('https://app.tribemd.com/**',async route=>{
  const req=route.request(),u=new URL(req.url());chamadas.push({metodo:req.method(),rota:u.pathname});
  if(u.pathname==='/login'){
   if(erro){await route.fulfill({status:404,headers:{'cf-mitigated':'challenge','x-amzn-waf-action':'challenge'},body:'Erro controlado'});return;}
   await route.fulfill({contentType:'text/html',body:`<label>E-mail ou CPF<input id="email" type="email"></label><label>Senha<input id="senha" type="password"></label><button id="entrar">Entrar</button><script>
   if(localStorage.getItem('bipp-user-token'))location.href='/atendimentos/agenda';
   document.getElementById('entrar').onclick=async()=>{const r=await fetch('/api/usuarios/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('senha').value})});if(r.ok){if(${exigirConstantes})await fetch('https://bipp.nyc3.cdn.digitaloceanspaces.com/bipp/static/constantes.json?t=1').then(r=>r.json());localStorage.setItem('bipp-user-token','token-ficticio');location.href='/atendimentos/agenda';}};
   </script>`});return;
  }
  if(u.pathname==='/api/usuarios/login'){await route.fulfill({contentType:'application/json',headers:{'Set-Cookie':'sessao=apenas-teste; Path=/; HttpOnly; Secure; SameSite=Lax'},body:'{"ok":true}'});return;}
  if(['/atendimentos/agenda','/pacientes'].includes(u.pathname)){
   await route.fulfill({contentType:'text/html',body:`<meta charset="utf-8"><nav><a href="/atendimentos/agenda">Agenda</a><a href="/pacientes">Pacientes</a></nav><table><tr><th>Nome</th><th>Última consulta</th></tr><tr><td>Paciente fictício</td><td>12/10/2026</td></tr></table>`});return;
  }
  await route.fulfill({status:404,body:''});
 });return {context,chamadas};
}
test('Chromium em Xvfb autentica em fixture, captura tela, lê agenda e restaura cookies da clínica',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tribemd-browser-'));const perfis=new PerfisTribemd(dir,randomBytes(32).toString('base64'));
 let n:NavegadorTribemd|undefined;
 try{
  n=await NavegadorTribemd.criar({executavel,xvfb},new AbortController().signal);const f=await fixture(n);
  assert.equal(await n.abrir(),'aguardando_credenciais');assert.equal((await n.tela())!.subarray(1,4).toString(),'PNG');
  await n.entrar('teste@example.invalid','credencial-ficticia');const r=await n.ler('agenda');assert.equal(r.consultas.length,1);assert.equal(r.historicoCompleto,false);
  await f.context.pages()[0].evaluate(()=>localStorage.setItem('pacientes-cache','fixture-descartada'));
  const estado=await n.perfil();assert.equal(JSON.stringify(estado).includes('fixture-descartada'),false);assert.equal(estado!.cookies.some(c=>c.name==='sessao'),true);
  // O guard de rede deve impedir até uma escrita disparada pelo próprio site após o login.
  const page=f.context.pages()[0];assert.equal(await page.evaluate(async()=>{try{await fetch('/api/pacientes',{method:'POST',body:'{}'});return true;}catch{return false;}}),false);
  assert.equal(f.chamadas.some(c=>c.metodo==='POST'&&c.rota==='/api/pacientes'),false);
  await perfis.salvar('clinica-a',{estado});await n.encerrar();
  const salvo=await perfis.ler('clinica-a');n=await NavegadorTribemd.criar({executavel,xvfb,estado:salvo.estado},new AbortController().signal);
  const segunda=await fixture(n);assert.equal(await n.abrir(),'perfil_reutilizado');assert.equal(segunda.chamadas.some(c=>c.metodo==='POST'),false);
  assert.equal((await segunda.context.cookies()).some(c=>c.name==='sessao'),true);await n.encerrar();
  n=await NavegadorTribemd.criar({executavel,xvfb,estado:(await perfis.ler('clinica-b')).estado},new AbortController().signal);await fixture(n);assert.equal(await n.abrir(),'aguardando_credenciais');
 }finally{await n?.encerrar();await rm(dir,{recursive:true,force:true});}
});
test('diagnóstico preserva status e sinais de borda sem divulgar cookies ou corpos',async()=>{
 const n=await NavegadorTribemd.criar({executavel,xvfb},new AbortController().signal);
 try{
  await fixture(n,true);
  await assert.rejects(n.abrir(),e=>{
   assert.equal(e instanceof ErroTribemd,true);const erro=e as ErroTribemd;
   assert.equal(erro.codigo,'LOGIN_HTTP_ERRO');assert.equal(erro.diagnostico?.statusHttp,404);
   const chamada=erro.diagnostico?.rede?.chamadas[0];assert.equal(chamada?.statusHttp,404);assert.equal(chamada?.cookiePresente,false);
   assert.equal(chamada?.sinais.includes('desafio_cloudflare'),true);assert.equal(chamada?.sinais.includes('desafio_aws_waf'),true);return true;
  });
 }finally{await n.encerrar();}
});


for (const prefixo of ['', caminhoTesteTribemd]) {
test('painel com captura e reabertura em fixture: '+(prefixo?'integrado no Noto':'independente'),async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tribemd-painel-')),token=randomBytes(32).toString('hex');
 const externo=express(),server=externo.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const original=NavegadorTribemd.criar;
 NavegadorTribemd.criar=async(opcoes,signal)=>{const n=await original.call(NavegadorTribemd,opcoes,signal);await fixture(n);return n;};
 let area:{encerrar:()=>Promise<void>};
 if(prefixo){area=montarAreaTesteTribemd(externo,{TRIBEMD_TESTE_ATIVO:'true',TRIBEMD_TESTE_TOKEN:token,TRIBEMD_TESTE_CHAVE:randomBytes(32).toString('base64'),TRIBEMD_TESTE_DIRETORIO:dir,TRIBEMD_TESTE_ORIGEM:base,CHROMIUM_EXECUTABLE_PATH:executavel,XVFB_EXECUTABLE_PATH:xvfb});}
 else{const independente=criarAreaTesteTribemd({token,chave:randomBytes(32).toString('base64'),diretorio:dir,origem:base,chromium:executavel,xvfb});externo.use(independente.app);area=independente;}
 const viewer=await chromium.launch({executablePath:executavel,headless:true,args:['--no-sandbox']});
 try{
  const context=await viewer.newContext({httpCredentials:{username:'teste',password:token}}),page=await context.newPage();
  await page.goto(base+prefixo);await page.locator('#abrir input').fill('clinica-fixture');await page.getByRole('button',{name:'Abrir navegador',exact:true}).click();
  await page.waitForFunction(()=>document.getElementById('estado')?.textContent?.includes('aguardando_login'));
  await page.locator('#login input[name=email]').fill('teste@example.invalid');await page.locator('#login input[name=senha]').fill('credencial-ficticia');
  await page.getByRole('button',{name:'Entrar e salvar criptografado'}).click();
  await page.waitForFunction(()=>document.getElementById('estado')?.textContent==='pronto');
  assert.equal(await page.locator('#login input[name=senha]').inputValue(),'');
  await page.getByRole('button',{name:'Abrir agenda e ler'}).click();
  await page.waitForFunction(()=>document.getElementById('dados')?.textContent?.includes('ultimaConsulta'));
  await page.waitForFunction(()=>{const i=document.getElementById('tela') as HTMLImageElement;return i.naturalWidth===1280;});
  assert.equal((await page.screenshot({mask:[page.locator('input')]})).length>1000,true);
  assert.equal((await page.locator('#diagnostico').textContent())?.includes('credencial-ficticia'),false);
  await page.getByRole('button',{name:'Encerrar e apagar resultado'}).click();await page.waitForFunction(()=>document.getElementById('estado')?.textContent==='Nenhuma sessão aberta.');
  assert.equal(await page.locator('#dados').textContent(),'');
  await page.getByRole('button',{name:'Abrir navegador',exact:true}).click();await page.waitForFunction(()=>document.getElementById('estado')?.textContent==='pronto');
 }finally{NavegadorTribemd.criar=original;await viewer.close();await area.encerrar();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});
}

test('shutdown aguarda criação pendente e impede iniciar navegador após encerramento',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tribemd-shutdown-')),token=randomBytes(32).toString('hex');
 const externo=express(),server=externo.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 let liberarBarreira!:()=>void,avisarInicio!:()=>void;
 const barreira=new Promise<void>(r=>{liberarBarreira=r;}),iniciou=new Promise<void>(r=>{avisarInicio=r;});
 const originalBloquear=PerfisTribemd.prototype.bloquear,originalCriar=NavegadorTribemd.criar;let criacoes=0;
 PerfisTribemd.prototype.bloquear=async function(id){const liberar=await originalBloquear.call(this,id);avisarInicio();await barreira;return liberar;};
 NavegadorTribemd.criar=async()=>{criacoes++;throw Error('NAVEGADOR_NAO_DEVE_INICIAR');};
 const area=criarAreaTesteTribemd({token,chave:randomBytes(32).toString('base64'),diretorio:dir,origem:base,chromium:executavel,xvfb});externo.use(area.app);
 try{
  const pedido=fetch(base+'/api/sessoes',{method:'POST',headers:{Authorization:'Basic '+Buffer.from('teste:'+token).toString('base64'),Origin:base,'Content-Type':'application/json','X-Tribemd-Teste':'1'},body:'{"clinica":"exemplo"}'});
  await iniciou;const fim=area.encerrar();liberarBarreira();await fim;
  assert.equal((await pedido).status,409);assert.equal(criacoes,0);assert.equal((await readdir(dir)).length,0);
 }finally{liberarBarreira();PerfisTribemd.prototype.bloquear=originalBloquear;NavegadorTribemd.criar=originalCriar;await area.encerrar();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});

test('página montada usa script relativo e mantém proteção no prefixo',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tribemd-prefixo-')),token=randomBytes(32).toString('hex');
 const externo=express(),server=externo.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`,prefixo='/desenvolvedor/tribemd';
 const area=criarAreaTesteTribemd({token,chave:randomBytes(32).toString('base64'),diretorio:dir,origem:base,chromium:executavel,xvfb});externo.use(prefixo,area.app);
 const headers={Authorization:'Basic '+Buffer.from('teste:'+token).toString('base64')};
 try{
  assert.equal((await fetch(base+prefixo+'/')).status,401);
  const r=await fetch(base+prefixo+'/',{headers}),html=await r.text(),src=html.match(/<script src="([^"]+)"/)?.[1];assert.ok(src);
  const url=new URL(src,base+prefixo+'/');assert.equal(url.pathname,prefixo+'/teste.js');
  assert.equal((await fetch(url,{headers})).status,200);
  const canonica=await fetch(base+prefixo,{headers,redirect:'manual'});assert.equal(canonica.status,308);assert.equal(canonica.headers.get('location'),prefixo+'/');
 }finally{await area.encerrar();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});


for (const env of [{}, {TRIBEMD_TESTE_ATIVO:'true'}]) {
 test('integração preserva rotas comuns quando '+(env.TRIBEMD_TESTE_ATIVO?'configuração falta':'teste está desativado'),async()=>{
  const app=express(),area=montarAreaTesteTribemd(app,env);app.get('/health',(_req,res)=>res.json({ok:true}));
  const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  try{assert.equal((await fetch(base+caminhoTesteTribemd+'/')).status,env.TRIBEMD_TESTE_ATIVO?503:404);assert.equal((await fetch(base+'/health')).status,200);}
  finally{await area.encerrar();await new Promise<void>(r=>server.close(()=>r()));}
 });
}
test('integração processa credenciais antes do parser geral e mantém Basic/TLS no prefixo',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tribemd-parser-')),token=randomBytes(32).toString('hex');
 const app=express(),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const area=montarAreaTesteTribemd(app,{TRIBEMD_TESTE_ATIVO:'true',TRIBEMD_TESTE_TOKEN:token,TRIBEMD_TESTE_CHAVE:randomBytes(32).toString('base64'),TRIBEMD_TESTE_DIRETORIO:dir,TRIBEMD_TESTE_ORIGEM:base});
 let leiturasGerais=0;
 app.use(express.json({verify:()=>{leiturasGerais++;}}));app.post('/rota-comum',(req,res)=>res.json({ok:req.body.ok}));
 const headers={Authorization:'Basic '+Buffer.from('teste:'+token).toString('base64'),Origin:base,'X-Tribemd-Teste':'1','Content-Type':'application/json'};
 try{
  const r=await fetch(base+caminhoTesteTribemd+'/api/sessoes/inexistente/login',{method:'POST',headers,body:'{"email":"teste@example.invalid","senha":"fixture-descartada"}'});
  assert.equal(r.status,410);assert.equal(leiturasGerais,0);
  assert.equal((await fetch(base+'/rota-comum',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"ok":true}'})).status,200);assert.equal(leiturasGerais,1);
  assert.equal((await fetch(base+caminhoTesteTribemd+'/api/sessoes/inexistente/tela')).status,401);
  const rejeitada=await fetch(base+caminhoTesteTribemd+'/api/sessoes',{method:'POST',headers:{...headers,Origin:'https://outra.invalid'},body:'{}'});assert.equal(rejeitada.status,403);assert.equal(leiturasGerais,1);
 }finally{await area.encerrar();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});

test('proxy HTTPS é validado apenas no subapp sem alterar trust proxy do Noto',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tribemd-tls-')),token=randomBytes(32).toString('hex');
 const app=express(),server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`,origem=base.replace('http:','https:');
 const area=montarAreaTesteTribemd(app,{TRIBEMD_TESTE_ATIVO:'true',TRIBEMD_TESTE_TOKEN:token,TRIBEMD_TESTE_CHAVE:randomBytes(32).toString('base64'),TRIBEMD_TESTE_DIRETORIO:dir,TRIBEMD_TESTE_ORIGEM:origem});
 app.get('/rota-comum',(req,res)=>res.json({secure:req.secure}));
 try{
  const auth={Authorization:'Basic '+Buffer.from('teste:'+token).toString('base64')};
  assert.equal((await fetch(base+caminhoTesteTribemd+'/',{headers:auth})).status,403);
  assert.equal((await fetch(base+caminhoTesteTribemd+'/',{headers:{'X-Forwarded-Proto':'https'}})).status,401);
  assert.equal((await fetch(base+caminhoTesteTribemd+'/',{headers:{...auth,'X-Forwarded-Proto':'https'}})).status,200);
  assert.equal(app.get('trust proxy'),false);
  assert.deepEqual(await (await fetch(base+'/rota-comum',{headers:{'X-Forwarded-Proto':'https'}})).json(),{secure:false});
 }finally{await area.encerrar();await new Promise<void>(r=>server.close(()=>r()));await rm(dir,{recursive:true,force:true});}
});

test('configuração incompleta informa nomes das variáveis sem valores',async()=>{
 const app=express(),area=montarAreaTesteTribemd(app,{TRIBEMD_TESTE_ATIVO:'true'});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const r=await fetch(base+caminhoTesteTribemd+'/'),j=await r.json();assert.equal(r.status,503);
  assert.deepEqual(j.pendencias.map((p:{variavel:string})=>p.variavel).sort(),['TRIBEMD_TESTE_CHAVE','TRIBEMD_TESTE_DIRETORIO','TRIBEMD_TESTE_ORIGEM','TRIBEMD_TESTE_TOKEN']);
 }finally{await area.encerrar();await new Promise<void>(r=>server.close(()=>r()));}
});


test('origem aceita barra final e normaliza host/porta sem aceitar caminho ou HTTP remoto',()=>{
 const env={TRIBEMD_TESTE_TOKEN:randomBytes(32).toString('hex'),TRIBEMD_TESTE_CHAVE:randomBytes(32).toString('base64'),TRIBEMD_TESTE_DIRETORIO:'/dados/tribemd',TRIBEMD_TESTE_ORIGEM:' https://EXAMPLE.com:443/ '};
 const r=validarConfiguracaoTesteTribemd(env);assert.equal(r.ok,true);if(r.ok)assert.equal(r.config.origem,'https://example.com');
 for(const origem of ['https://example.com/desenvolvedor/tribemd/','http://example.com','https://example.com/?a=1','https://usuario:segredo@example.com/']){
  const ruim=validarConfiguracaoTesteTribemd({...env,TRIBEMD_TESTE_ORIGEM:origem});assert.equal(ruim.ok,false);
  if(!ruim.ok){assert.equal(ruim.pendencias[0].variavel,'TRIBEMD_TESTE_ORIGEM');assert.equal(JSON.stringify(ruim).includes('segredo'),false);}
 }
});
test('validação distingue chave base64 de senha comum e não divulga valores',()=>{
 const segredo='fixture-sem-base64-32-caracteres!';
 const ruim=validarConfiguracaoTesteTribemd({TRIBEMD_TESTE_TOKEN:'curto',TRIBEMD_TESTE_CHAVE:segredo,TRIBEMD_TESTE_DIRETORIO:'/dados/tribemd',TRIBEMD_TESTE_ORIGEM:'https://example.com'});
 assert.equal(ruim.ok,false);if(!ruim.ok){assert.deepEqual(ruim.pendencias.map(p=>p.variavel),['TRIBEMD_TESTE_TOKEN','TRIBEMD_TESTE_CHAVE']);assert.equal(JSON.stringify(ruim).includes(segredo),false);assert.equal(JSON.stringify(ruim).includes('curto'),false);}
 const chave=randomBytes(32).toString('base64');assert.equal(validarConfiguracaoTesteTribemd({TRIBEMD_TESTE_TOKEN:randomBytes(32).toString('hex'),TRIBEMD_TESTE_CHAVE:chave,TRIBEMD_TESTE_DIRETORIO:'/dados/tribemd',TRIBEMD_TESTE_ORIGEM:'https://example.com/'}).ok,true);
});


test('login aguarda constantes públicas no CDN após API200 e conclui sem credenciais no CDN',async()=>{
 const n=await NavegadorTribemd.criar({executavel,xvfb},new AbortController().signal);
 try{
  await fixture(n,false,true);assert.equal(await n.abrir(),'aguardando_credenciais');
  await n.entrar('teste@example.invalid','credencial-ficticia');
  const chamadas=n.diagnosticar().rede?.chamadas||[];
  const login=chamadas.find(c=>c.rota==='/api/usuarios/login');assert.equal(login?.statusHttp,200);
  const cdn=chamadas.find(c=>c.servidor==='bipp.nyc3.cdn.digitaloceanspaces.com');assert.equal(cdn?.statusHttp,200);assert.equal(cdn?.cookiePresente,false);assert.equal(cdn?.autorizacaoPresente,false);
 }finally{await n.encerrar();}
});


test('permite apenas o JSON público de constantes no CDN com cache público e sem escritas',()=>{
 const u=constantesPublicasTribemd;
 for(const fase of [true,false])assert.equal(permitirRequisicaoTribemd(u+'?t=2026-10-17%2012:00:00','GET','fetch',fase),true);
 assert.equal(permitirRequisicaoTribemd(u,'HEAD','xhr',true),true);
 for(const m of ['POST','PUT','DELETE','PATCH','OPTIONS'])assert.equal(permitirRequisicaoTribemd(u,m,'fetch',true),false);
 for(const tipo of ['document','script','image','websocket'])assert.equal(permitirRequisicaoTribemd(u,'GET',tipo,true),false);
 for(const url of [u.replace('https:','http:'),u.replace('constantes.json','outro.json'),u.replace('constantes.json','medicamentos.json'),u+'?token=fixture',u+'?t=1&t=2',u.replace('bipp.nyc3.cdn.digitaloceanspaces.com','outro.invalid')])assert.equal(permitirRequisicaoTribemd(url,'GET','fetch',true),false);
});
test('recurso público recusa credenciais e remove Referer sem modificar os demais cabeçalhos',()=>{
 for(const nome of ['Authorization','cookie','proxy-authorization','x-api-key'])assert.equal(headersRecursoPublicoTribemd({[nome]:'fixture-sensivel'}),null);
 const original={referer:'https://app.tribemd.com/pacientes/fixture',origin:'https://app.tribemd.com',accept:'application/json'};
 assert.deepEqual(headersRecursoPublicoTribemd(original),{origin:original.origin,accept:original.accept});assert.equal('referer' in original,true);
});
test('bloqueio do piloto é identificado como política, sem ser confundido com conexão',async()=>{
 const n=await NavegadorTribemd.criar({executavel,xvfb},new AbortController().signal);
 try{
  const f=await fixture(n);await n.abrir();
  const bloqueado=await f.context.pages()[0].evaluate(async()=>{try{await fetch('/api/pacientes',{method:'POST',body:'{}'});return false;}catch{return true;}});assert.equal(bloqueado,true);
  await n.entrar('teste@example.invalid','credencial-ficticia');
  const req=n.diagnosticar().rede?.chamadas.find(c=>c.rota==='/api/pacientes'&&c.metodo==='POST');assert.equal(req?.falha,'bloqueada_politica');assert.equal(req?.statusHttp,undefined);
  assert.equal(f.chamadas.some(c=>c.metodo==='POST'&&c.rota==='/api/pacientes'),false);
 }finally{await n.encerrar();}
});
