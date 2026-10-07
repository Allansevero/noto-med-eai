import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { ObservadorRedeLoginTribemd } from './tribemd-rede.js';
async function navegador(t:any){const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});t.after(()=>b.close());return b.newPage();}
test('observa resposta 403 do login sem registrar conteúdo, query, cookies ou tokens',async t=>{
 const page=await navegador(t);
 await page.route('**/*',async route=>{const u=new URL(route.request().url());
  if(u.pathname==='/login')await route.fulfill({contentType:'text/html',body:'<button onclick="fetch(\'/api/auth/login/segredo-no-caminho?token=segredo-query\',{method:\'POST\',headers:{Authorization:\'Bearer segredo-token\'},body:\'senha=segredo-corpo\'})">Entrar</button>'});
  else await route.fulfill({status:403,headers:{'server':'cloudflare','cf-mitigated':'challenge','set-cookie':'privado=segredo-cookie'},body:'segredo-resposta'});
 });
 const rede=new ObservadorRedeLoginTribemd(page);await page.goto('https://app.tribemd.com/login');rede.marcarEnvioLogin();
 const resposta=page.waitForResponse(r=>r.status()===403);await page.getByRole('button').click();await resposta;
 const d=await rede.concluir();const chamada=d.chamadas.find(c=>c.statusHttp===403)!;
 assert.equal(chamada.servidor,'app.tribemd.com');assert.equal(chamada.rota,'/api/auth/login/[segmento]');assert.equal(chamada.categoria,'autenticacao');assert.equal(chamada.metodo,'POST');assert.equal(chamada.fase,'envio_login');
 assert.ok(chamada.sinais.includes('desafio_cloudflare'));assert.equal(d.chamadas.find(c=>c.tipo==='document')!.statusHttp,200);
 assert.ok(!JSON.stringify(d).includes('segredo'));assert.ok(!JSON.stringify(d).includes('Authorization'));assert.ok(!JSON.stringify(d).includes('set-cookie'));
});
test('falha de rede é classificada sem publicar a mensagem bruta',async t=>{
 const page=await navegador(t);await page.route('**/*',r=>r.abort('namenotresolved'));const rede=new ObservadorRedeLoginTribemd(page);
 await assert.rejects(()=>page.goto('https://app.tribemd.com/login?senha=privada'));
 const d=await rede.concluir();assert.equal(d.chamadas[0].falha,'dns');assert.ok(!JSON.stringify(d).includes('privada'));assert.ok(!JSON.stringify(d).includes('net::'));
});
test('limite preserva falhas recentes e listeners não continuam após concluir',async t=>{
 const page=await navegador(t);await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<p>Teste</p>'}));
 const rede=new ObservadorRedeLoginTribemd(page);await page.goto('https://app.tribemd.com/login');rede.marcarEnvioLogin();
 await page.evaluate(async()=>{for(let i=0;i<45;i++)await fetch('/api/status?numero='+i);});
 await page.route('**/api/auth/login',r=>r.fulfill({status:403,body:'recusado'}));const espera=page.waitForResponse(r=>r.status()===403);await page.evaluate(()=>fetch('/api/auth/login',{method:'POST'}));await espera;
 const d=await rede.concluir();assert.equal(d.limiteChamadas,40);assert.equal(d.chamadas.length,40);assert.equal(d.limitado,true);assert.ok(d.chamadas.some(c=>c.statusHttp===403));
 await page.evaluate(()=>fetch('/api/status'));assert.deepEqual(await rede.concluir(),d);
});
