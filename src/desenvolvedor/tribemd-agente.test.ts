import { test } from 'node:test';
import assert from 'node:assert/strict';
import { investigarTribemd, GroqDecisorTribemd } from './tribemd-agente.js';
const leitura={tela:{url:'https://app.tribemd.com/pacientes',campos:[],tabelas:[{colunas:['Nome','CPF','E-mail'],linhas:[['Ana','52998224725','ana@example.com']]}]},opcoes:[{id:'agenda',acao:'abrir_agenda' as const}],diagnostico:{caminho:'/pacientes',tabelas:1,linhas:1,campos:[],limitada:false}};
test('agente usa ferramenta oferecida e preserva os dados extraídos sem enviar dados pessoais ao decisor',async()=>{
 const executadas:string[]=[],contextos:any[]=[];let i=0;
 const n={async entrar(){},async encerrar(){},async ler(){return i++?{...leitura,opcoes:[]}:leitura;},async executar(id:string){executadas.push(id);}};
 const r=await investigarTribemd(n,{async decidir(c){contextos.push(c);return 'agenda';}},'2026-10-07','2026-10-14',new AbortController().signal,()=>{});
 assert.deepEqual(executadas,['agenda']);assert.equal(r.pacientes.length,1);assert.equal(r.pacientes[0].cpf,'52998224725');
 assert.ok(!JSON.stringify(contextos).includes('ana@example.com'));assert.ok(!JSON.stringify(contextos).includes('52998224725'));assert.equal(r.cobertura.completa,false);
});
test('a tela da última ação permitida também é lida',async()=>{
 let executadas=0;const n={async entrar(){},async encerrar(){},async executar(){executadas++;},async ler(){return {...leitura,tela:executadas===30?{url:'https://app.tribemd.com/agenda',campos:[],tabelas:[{colunas:['Paciente','Data'],linhas:[['Ana','08/10/2026']]}]}:{url:'https://app.tribemd.com/inicio',campos:[],tabelas:[]},opcoes:[{id:'pagina-'+executadas,acao:'proxima_pagina' as const}]};}};
 const r=await investigarTribemd(n,{async decidir(c){return c.ferramentas[0].id;}},'2026-10-07','2026-10-14',new AbortController().signal,()=>{});
 assert.equal(executadas,30);assert.equal(r.agendamentos.length,1);assert.equal(r.cobertura.paginasConsultadas,31);
});
test('leitura da ficha completa o mesmo ID observado na lista em vez de duplicar o paciente',async()=>{
 let i=0;const n={async entrar(){},async encerrar(){},async executar(){},async ler(){return i++?{...leitura,tela:{url:'https://app.tribemd.com/pacientes/1',campos:[{rotulo:'Nome completo',valor:'Ana'},{rotulo:'CPF',valor:'52998224725'}],tabelas:[]},opcoes:[]}:{...leitura,tela:{url:'https://app.tribemd.com/pacientes',campos:[],tabelas:[{colunas:['ID','Nome','E-mail'],linhas:[['1','Ana','ana@example.com']]}]}};}};
 const r=await investigarTribemd(n,{async decidir(){return 'agenda';}},'2026-10-07','2026-10-14',new AbortController().signal,()=>{});
 assert.equal(r.pacientes.length,1);assert.equal(r.pacientes[0].cpf,'52998224725');assert.equal(r.pacientes[0].email,'ana@example.com');assert.equal(r.pacientes[0].id,'1');
});
test('falha de decisão depois da leitura mantém o resultado parcial no callback',async()=>{
 let parcial:any;const n={async entrar(){},async encerrar(){},async executar(){},async ler(){return leitura;}};
 await assert.rejects(()=>investigarTribemd(n,{async decidir(){throw new Error('falha');}},'2026-10-07','2026-10-14',new AbortController().signal,()=>{},r=>{parcial=r;}));
 assert.equal(parcial.pacientes[0].cpf,'52998224725');
});
test('ação inventada pelo modelo é rejeitada antes de executar qualquer ferramenta',async()=>{
 let exec=0;const n={async entrar(){},async encerrar(){},async ler(){return leitura;},async executar(){exec++;}};
 await assert.rejects(()=>investigarTribemd(n,{async decidir(){return 'editar-cadastro';}},'2026-10-07','2026-10-14',new AbortController().signal,()=>{}),(e:any)=>e.codigo==='FERRAMENTA_NAO_PERMITIDA');assert.equal(exec,0);
});
test('Groq recebe somente metadados e sua resposta passa por validação',async t=>{
 t.mock.method(globalThis,'fetch',async(_url:any,init:any)=>{const b=JSON.parse(init.body);assert.deepEqual(JSON.parse(b.messages[1].content).ferramentas,[{id:'agenda',acao:'abrir_agenda'}]);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({ferramentaId:'agenda'})}}]}));});
 const c=new GroqDecisorTribemd('chave','modelo');assert.equal(await c.decidir({ferramentas:leitura.opcoes,passo:1,pacientes:0,agendamentos:0}),'agenda');
});

test('decisor visual envia recortes dos controles ao modelo de visão e valida a ação',async t=>{
 let corpo:any;
 t.mock.method(globalThis,'fetch',async(_u:any,init:any)=>{corpo=JSON.parse(init.body);return new Response(JSON.stringify({choices:[{message:{content:'{"ferramentaId":"agenda"}'}}]}));});
 const d=new GroqDecisorTribemd('chave','texto','visao');
 assert.equal(await d.decidir({ferramentas:leitura.opcoes,passo:1,pacientes:0,agendamentos:0,visao:[{ferramentaId:'agenda',imagemBase64:'iVBORw0KGgo='}]}),'agenda');
 assert.equal(corpo.model,'visao');assert.equal(corpo.messages[1].content[2].type,'image_url');
 assert.equal(corpo.messages[1].content[2].image_url.url,'data:image/png;base64,iVBORw0KGgo=');
 assert.ok(!corpo.messages[1].content[0].text.includes('imagemBase64'));
});
