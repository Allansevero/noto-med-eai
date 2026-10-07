import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { criarRouterTribemdDesenvolvedor } from './tribemd-router.js';
import { NavegadorTribemd } from './tribemd-navegador.js';
const token='chave-desenvolvedor-de-teste-1234567890';
async function ambiente(t:any){
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});t.after(()=>browser.close());
 const context=await browser.newContext({viewport:{width:1280,height:900}});let fechados=0,criados=0,confirmarFechamento!:()=>void;const fechou=new Promise<void>(r=>{confirmarFechamento=r;});const logs:unknown[]=[];
 await context.route('**/*',route=>{
  const caminho=new URL(route.request().url()).pathname;
  if(caminho==='/login')return route.fulfill({contentType:'text/html',body:`<form><input type=email name=email style="position:absolute;left:20px;top:20px;width:240px;height:40px"><input type=password style="position:absolute;left:20px;top:80px;width:240px;height:40px"><button style="position:absolute;left:20px;top:140px;width:240px;height:40px">Entrar</button></form><script>document.querySelector('form').onsubmit=e=>{e.preventDefault();if(document.querySelector('[name=email]').value==='medico@example.com'&&document.querySelector('[type=password]').value==='senha-secreta'){const b=document.createElement('button');b.textContent='Concluir verificação';b.style.cssText='position:absolute;left:20px;top:200px;width:240px;height:40px';b.onclick=()=>location.href='/inicio';document.body.replaceChildren(b);}}</script>`});
  return route.fulfill({contentType:'text/html',headers:{'set-cookie':'sessao=autenticada; HttpOnly; Secure; Path=/'},body:'<nav><a href=/pacientes>Pacientes</a><a href=/agenda>Agenda</a></nav><table><tr><th>Nome</th><th>CPF</th></tr><tr><td>Ana</td><td>52998224725</td></tr></table>'});
 });
 const n=new NavegadorTribemd(context,async()=>{fechados++;await context.close();confirmarFechamento();});
 const app=express();app.get('/teste',(_req,res)=>res.type('html').send(readFileSync(new URL('../ui/desenvolvedor-tribemd.html',import.meta.url),'utf8')));app.use(express.json());const router=criarRouterTribemdDesenvolvedor({ativo:true,token,configurado:true,registrar:e=>logs.push(e),decisor:{async decidir(){return null;}},async criarNavegador(){criados++;return n;}});app.use('/api/desenvolvedor/tribemd',router);app.use('/api',router);
 const server=await new Promise<any>(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
 const pedir=async(path:string,method='GET',body?:unknown,chave=token)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{Authorization:'Bearer '+chave,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,data:await r.json()};};
 const aguardar=async(id:string,estado:string)=>{for(let i=0;i<150;i++){const r=await pedir('/sessoes/'+id);if(r.data.estado===estado)return r.data;await new Promise(r=>setTimeout(r,20));}throw Error('Estado não chegou: '+estado);};
 const s=await pedir('/sessoes','POST',{modo:'assistido',inicio:'2026-10-07',fim:'2026-10-14'});assert.equal(s.status,202);
 const id=s.data.sessaoId;await aguardar(id,'aguardando_login');
 t.after(async()=>{await pedir('/sessoes/'+id,'DELETE');await new Promise<void>(r=>{server.closeAllConnections();server.close(()=>r());});});
 const controle=(body:unknown)=>pedir('/sessoes/'+id+'/controle','POST',body);
 return {pedir,aguardar,id,controle,n,context,logs,fechou,browser,url:`http://127.0.0.1:${server.address().port}`,fechados:()=>fechados,criados:()=>criados};
}
test('login assistido aguarda usuário, rejeita entrega prematura e protege os controles',async t=>{
 const a=await ambiente(t);assert.equal(a.fechados(),0);await assert.rejects(()=>a.n.ler());
 const r=await a.pedir('/sessoes/'+a.id+'/continuar','POST');assert.equal(r.status,409);
 assert.equal((await a.pedir('/sessoes/'+a.id)).data.estado,'aguardando_login');
 assert.equal((await a.pedir('/sessoes/'+a.id+'/controle','POST',{tipo:'clicar',x:40,y:40},'errada')).status,401);
 assert.equal((await a.controle({tipo:'navegar',url:'https://outro.com'})).status,400);
 assert.equal((await a.controle({tipo:'clicar',x:-1,y:10})).status,400);
 assert.equal((await a.controle({tipo:'tecla',tecla:'Control+L'})).status,400);
 assert.equal((await a.controle({tipo:'digitar',texto:'x'.repeat(257)})).status,400);
});
test('usuário entra e conclui verificação antes da IA assumir o mesmo navegador',{timeout:10000},async t=>{
 const a=await ambiente(t);
 assert.equal((await a.controle({tipo:'clicar',x:40,y:40})).status,200);
 await a.controle({tipo:'digitar',texto:'medico@example.com'});
 await a.controle({tipo:'tecla',tecla:'Tab'});await a.controle({tipo:'digitar',texto:'senha-secreta'});
 await a.controle({tipo:'clicar',x:40,y:160});await a.controle({tipo:'clicar',x:40,y:220});
 await a.context.pages()[0].waitForURL(u=>u.pathname==='/inicio');
 assert.equal((await a.controle({tipo:'clicar',x:40,y:40})).status,409);
 const cookies=await a.context.cookies();assert.equal(cookies.find(c=>c.name==='sessao')?.value,'autenticada');
 const entrega=await a.pedir('/sessoes/'+a.id+'/continuar','POST');assert.equal(entrega.status,202);
 assert.equal((await a.pedir('/sessoes/'+a.id+'/continuar','POST')).status,409);
 const r=await a.aguardar(a.id,'parcial');assert.equal(r.resultado.pacientes[0].cpf,'52998224725');
 assert.equal(a.criados(),1);assert.ok(!JSON.stringify(r).includes('senha-secreta'));assert.ok(!JSON.stringify(a.logs).includes('medico@example.com'));
 assert.ok(r.eventos.some((e:any)=>e.etapa==='controle_humano'));assert.ok(r.eventos.some((e:any)=>e.etapa==='login_confirmado'));
 await a.fechou;assert.equal(a.fechados(),1);
});
test('encerrar durante login assistido apaga tela e impede novos comandos',async t=>{
 const a=await ambiente(t);const tela=await a.pedir('/sessoes/'+a.id+'/tela');assert.ok(tela.data.imagemBase64);
 assert.equal((await a.pedir('/sessoes/'+a.id,'DELETE')).status,202);
 for(let i=0;i<150;i++){const r=await a.pedir('/sessoes/atual');if(!r.data.sessaoAtual)break;await new Promise(r=>setTimeout(r,20));}
 assert.equal((await a.pedir('/sessoes/'+a.id+'/tela')).status,410);assert.equal((await a.controle({tipo:'tecla',tecla:'Enter'})).status,410);assert.equal(a.fechados(),1);
});

test('painel real permite clicar, digitar, verificar e entregar o navegador',{timeout:15000},async t=>{
 const a=await ambiente(t),cliente=await a.browser.newContext({viewport:{width:1100,height:900}});t.after(()=>cliente.close());const page=await cliente.newPage();
 await page.goto(a.url+'/teste');await page.locator('#chave').fill(token);await page.locator('#btnAcesso').click();await page.locator('#telaVirtual').waitFor({state:'visible'});
 const pronta=()=>page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('#btnDigitar')!.disabled);
 const clicar=async(x:number,y:number)=>{const img=page.locator('#telaVirtual'),b=await img.boundingBox();assert.ok(b);await img.click({position:{x:x*b.width/1280,y:y*b.height/900}});await pronta();};
 const digitar=async(texto:string)=>{await page.locator('#textoRemoto').fill(texto);await page.locator('#btnDigitar').click();await pronta();assert.equal(await page.locator('#textoRemoto').inputValue(),'');};
 await pronta();await clicar(40,40);await digitar('medico@example.com');await page.locator('#btnTab').click();await pronta();await digitar('senha-secreta');
 await clicar(40,160);await clicar(40,220);await a.context.pages()[0].waitForURL(u=>u.pathname==='/inicio');
 await page.locator('#btnContinuar').click();await page.waitForFunction(()=>document.querySelector('#resultado')!.textContent!.includes('52998224725'));
 assert.equal(await page.locator('#controlesLogin').isVisible(),false);assert.ok(!await page.locator('#resultado').textContent().then(v=>v?.includes('senha-secreta')));
 await a.fechou;
});
