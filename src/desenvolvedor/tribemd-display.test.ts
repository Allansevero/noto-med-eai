import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { TelaVirtualTribemd } from './tribemd-display.js';
import { investigarTribemd } from './tribemd-agente.js';
import { NavegadorTribemd } from './tribemd-navegador.js';
test('tela virtual real suporta Chromium com janela e encerra seu servidor gráfico',async t=>{
 const display=await TelaVirtualTribemd.iniciar(new AbortController().signal);t.after(()=>display.encerrar());
 const socket='/tmp/.X11-unix/X'+display.display.slice(1);assert.ok(existsSync(socket));
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:false,env:{...process.env,DISPLAY:display.display},args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});t.after(()=>browser.close());
 const page=await browser.newPage();await page.setContent('<h1>Noto · Tela virtual</h1><button>Pacientes</button>');
 const png=await page.screenshot();assert.equal(png.subarray(1,4).toString(),'PNG');await browser.close();await display.encerrar();assert.equal(existsSync(socket),false);
});
test('fábrica de navegador cria e encerra o computador virtual sem acessar sites externos',async()=>{
 const n=await NavegadorTribemd.criar('/usr/bin/chromium',new AbortController().signal);
 assert.equal(await n.capturarTela(),null);await n.encerrar();await n.encerrar();
});
test('cancelamento ou executável ausente interrompem a preparação da tela',async()=>{
 await assert.rejects(()=>TelaVirtualTribemd.iniciar(AbortSignal.abort()));
 await assert.rejects(()=>TelaVirtualTribemd.iniciar(new AbortController().signal,'/nao-existe/Xvfb'));
});

test('computador virtual faz login e coleta com controles visuais em portal controlado',async t=>{
 const n=await NavegadorTribemd.criar('/usr/bin/chromium',new AbortController().signal);t.after(()=>n.encerrar());
 // Intercepta apenas a dependência externa; usa a fábrica e ferramentas reais.
 const contexto=(n as any).context;
 await contexto.route('**/*',async(route:any)=>{
  const u=new URL(route.request().url());
  const html=u.pathname==='/login'?'<form><input type=email><input type=password><button>Entrar</button></form><script>document.querySelector("form").onsubmit=e=>{e.preventDefault();location.href="/inicio"}</script>':u.pathname==='/inicio'?'<a href=/pacientes>Pacientes</a>':'<table><tr><th>Nome</th><th>CPF</th></tr><tr><td>Ana</td><td>52998224725</td></tr></table>';
  await route.fulfill({contentType:'text/html; charset=utf-8',body:html});
 });
 await n.entrar('teste@example.com','segredo',new AbortController().signal);
 let observou=false;
 const r=await investigarTribemd(n,{async decidir(c){observou=!!c.visao?.length;return c.ferramentas[0].id;}},'2026-10-07','2026-10-14',new AbortController().signal,()=>{});
 assert.ok(observou);assert.equal(r.pacientes[0].cpf,'52998224725');assert.equal((await n.capturarTela())!.subarray(1,4).toString(),'PNG');
});
