import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { NavegadorTribemd } from './tribemd-navegador.js';
import { investigarTribemd } from './tribemd-agente.js';
async function portal(t:any,desafio=false,botoes=false,atraso=false,skeleton=false){
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 t.after(()=>browser.close());const context=await browser.newContext();
 let mensagens=0;
 await context.route('**/*',async route=>{const u=new URL(route.request().url());let html='';
  if(u.pathname==='/login')html=`<form><label>E-mail<input type=email name=email></label><label>Senha<input type=password></label><button>Entrar</button></form><script>document.querySelector('form').onsubmit=e=>{e.preventDefault();if(document.querySelector('[type=password]').value==='correta')location.href='/inicio';else document.body.insertAdjacentHTML('beforeend','<p>Senha incorreta</p>')}</script>`;
  else if(u.pathname==='/inicio')html=desafio?'<p>Autenticação de dois fatores. Código de verificação.</p>':botoes?'<nav><button onclick="location.href=\'/pacientes\'">Pacientes</button><button onclick="location.href=\'/agenda\'">Agenda</button></nav><form><button>Pacientes</button></form>':'<a href=/pacientes>Pacientes</a><a href=/agenda>Agenda</a><a href=/pagamentos>Pagamentos</a>';
  else if(u.pathname==='/pacientes')html='<a href=/agenda>Agenda</a><table><tr><th>Nome</th><th>CPF</th><th>E-mail</th><th>Telefone</th><th>Anamnese</th></tr><tr><td><a href=/pacientes/1>Ana</a></td><td>52998224725</td><td>ana@example.com</td><td>51981234567</td><td>prontuário privado</td></tr></table><a href=/pacientes/novo>Novo paciente</a>';
  else if(u.pathname==='/pacientes/1')html='<dl><dt>Nome completo</dt><dd>Ana</dd><dt>CPF</dt><dd>52998224725</dd><dt>Diagnóstico</dt><dd>prontuário privado</dd></dl>';
  else if(u.pathname==='/agenda')html='<table><tr><th>Paciente</th><th>Data</th><th>Horário</th></tr><tr><td>Ana</td><td>08/10/2026</td><td>14:00</td></tr></table><button onclick="fetch(\'/enviar-mensagem\',{method:\'POST\'})">Enviar mensagem</button>';
  else {mensagens++;html='<p>Não deveria acessar</p>';}
  if(atraso&&u.pathname==='/pacientes'){const tabela=html;html='<a href=/inicio>Início</a><script>setTimeout(()=>document.body.insertAdjacentHTML("beforeend",'+JSON.stringify(tabela)+'),500)</script>';}
  if(skeleton&&u.pathname==='/pacientes')html='<table><thead><tr><th>Nome</th></tr></thead><tbody></tbody></table><script>setTimeout(()=>document.querySelector("tbody").innerHTML="<tr><td>Ana</td></tr>",500)</script>';
  await route.fulfill({contentType:'text/html; charset=utf-8',body:html});
 });
 return {n:new NavegadorTribemd(context),mensagens:()=>mensagens};
}
test('navegador real autentica, oferece somente navegação de leitura e filtra dados clínicos',async t=>{
 const p=await portal(t);await p.n.entrar('teste@example.com','correta',new AbortController().signal);
 const inicio=await p.n.ler();assert.deepEqual(inicio.opcoes.map(o=>o.acao).sort(),['abrir_agenda','abrir_pacientes']);
 await assert.rejects(()=>p.n.executar('enviar-mensagem'));
 await p.n.executar(inicio.opcoes.find(o=>o.acao==='abrir_pacientes')!.id);const lista=await p.n.ler();
 assert.equal(lista.tela.tabelas[0].linhas[0][0],'Ana');assert.ok(!JSON.stringify(lista).includes('prontuário privado'));
 assert.ok(lista.opcoes.some(o=>o.acao==='ler_cadastro'));assert.ok(!JSON.stringify(lista.opcoes).includes('novo'));
 await p.n.executar(lista.opcoes.find(o=>o.acao==='ler_cadastro')!.id);const ficha=await p.n.ler();assert.equal(ficha.tela.campos.find(c=>c.rotulo==='CPF')!.valor,'52998224725');
 assert.equal(p.mensagens(),0);await p.n.encerrar();
});
test('espera conteúdo assíncrono em vez de usar o menu como sinal de carregamento',async t=>{
 const p=await portal(t,false,false,true);await p.n.entrar('teste@example.com','correta',new AbortController().signal);const l=await p.n.ler();
 await p.n.executar(l.opcoes.find(o=>o.acao==='abrir_pacientes')!.id);const tabela=await p.n.ler();assert.equal(tabela.tela.tabelas.length,1);
});
test('loop completo em navegador real reúne paciente e agenda com evidências, sem visitar edição',async t=>{
 const p=await portal(t);await p.n.entrar('teste@example.com','correta',new AbortController().signal);
 const r=await investigarTribemd(p.n,{async decidir(c){return [...c.ferramentas].sort((a,b)=>['abrir_pacientes','abrir_agenda','ler_cadastro','proxima_pagina'].indexOf(a.acao)-['abrir_pacientes','abrir_agenda','ler_cadastro','proxima_pagina'].indexOf(b.acao))[0]?.id||null;}},'2026-10-07','2026-10-14',new AbortController().signal,()=>{});
 assert.equal(r.pacientes.length,1);assert.equal(r.pacientes[0].cpf,'52998224725');assert.equal(r.pacientes[0].email,'ana@example.com');
 assert.equal(r.agendamentos.length,1);assert.equal(r.agendamentos[0].data,'2026-10-08');assert.equal(r.agendamentos[0].horario,'14:00');
 assert.ok(!JSON.stringify(r).includes('prontuário privado'));assert.equal(p.mensagens(),0);
});
test('menus de leitura em botões funcionam sem oferecer botões de formulário ao agente',async t=>{
 const p=await portal(t,false,true);await p.n.entrar('teste@example.com','correta',new AbortController().signal);
 const inicio=await p.n.ler();assert.equal(inicio.opcoes.length,2);
 await p.n.executar(inicio.opcoes.find(o=>o.acao==='abrir_pacientes')!.id);const dados=await p.n.ler();assert.equal(dados.tela.tabelas[0].linhas[0][0],'Ana');
});
test('não confunde desafio após login com sessão autenticada',async t=>{
 const p=await portal(t,true);await assert.rejects(()=>p.n.entrar('teste@example.com','correta',new AbortController().signal),(e:any)=>e.codigo==='VALIDACAO_ADICIONAL');
});

test('espera linhas de tabela skeleton sem indicador de carregamento',async t=>{
 const p=await portal(t,false,false,false,true);await p.n.entrar('teste@example.com','correta',new AbortController().signal);const l=await p.n.ler();
 await p.n.executar(l.opcoes.find(o=>o.acao==='abrir_pacientes')!.id);const r=await p.n.ler();assert.equal(r.tela.tabelas[0].linhas.length,1);
});
