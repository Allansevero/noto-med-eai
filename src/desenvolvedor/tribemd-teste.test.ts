import express from 'express';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { BrowserContext } from 'playwright-core';
import { loginTribemd, agendaTribemd, permitirRequisicaoTribemd, lerConsultas } from './tribemd-leitura.js';
import { PerfisTribemd } from './tribemd-perfil.js';
import { NavegadorTribemd, ErroTribemd } from './tribemd-navegador.js';
import { chromium } from 'playwright-core';
import { criarAreaTesteTribemd } from './tribemd-teste-router.js';

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
async function fixture(n:NavegadorTribemd,erro=false){
 const context=(n as unknown as {context:BrowserContext}).context;
 const chamadas:{metodo:string;rota:string}[]=[];
 await context.route('https://app.tribemd.com/**',async route=>{
  const req=route.request(),u=new URL(req.url());chamadas.push({metodo:req.method(),rota:u.pathname});
  if(u.pathname==='/login'){
   if(erro){await route.fulfill({status:404,headers:{'cf-mitigated':'challenge','x-amzn-waf-action':'challenge'},body:'Erro controlado'});return;}
   await route.fulfill({contentType:'text/html',body:`<label>E-mail ou CPF<input id="email" type="email"></label><label>Senha<input id="senha" type="password"></label><button id="entrar">Entrar</button><script>
   if(localStorage.getItem('bipp-user-token'))location.href='/atendimentos/agenda';
   document.getElementById('entrar').onclick=async()=>{const r=await fetch('/api/usuarios/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:document.getElementById('email').value,password:document.getElementById('senha').value})});if(r.ok){localStorage.setItem('bipp-user-token','token-ficticio');location.href='/atendimentos/agenda';}};
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


test('painel funciona de ponta a ponta com captura ao vivo e reabertura do perfil em fixture',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'tribemd-painel-')),token=randomBytes(32).toString('hex');
 const externo=express(),server=externo.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const original=NavegadorTribemd.criar;
 NavegadorTribemd.criar=async(opcoes,signal)=>{const n=await original.call(NavegadorTribemd,opcoes,signal);await fixture(n);return n;};
 const area=criarAreaTesteTribemd({token,chave:randomBytes(32).toString('base64'),diretorio:dir,origem:base,chromium:executavel,xvfb});externo.use(area.app);
 const viewer=await chromium.launch({executablePath:executavel,headless:true,args:['--no-sandbox']});
 try{
  const context=await viewer.newContext({httpCredentials:{username:'teste',password:token}}),page=await context.newPage();
  await page.goto(base);await page.locator('#abrir input').fill('clinica-fixture');await page.getByRole('button',{name:'Abrir navegador',exact:true}).click();
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
