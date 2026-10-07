import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EvolutionColetorClient } from './evolution-coletor.js';
const nome='noto_dev_coletor_'+ 'a'.repeat(32);
test('instância isolada sincroniza histórico e desativa webhook antes de obter QR',async t=>{
  const chamadas:any[]=[];
  t.mock.method(globalThis,'fetch',async(url:any,init:any)=>{chamadas.push({url,body:init.body?JSON.parse(init.body):null,method:init.method});
    return new Response(JSON.stringify(String(url).includes('/connect/')?{base64:'AAAA'}:{messages:{records:[],pages:2}}));});
  const c=new EvolutionColetorClient('https://evolution.test/','segredo');await c.criar(nome);
  assert.equal(chamadas[0].body.instanceName,nome);assert.equal(chamadas[0].body.syncFullHistory,true);
  assert.equal(chamadas.find(c=>c.url.includes('/settings/set/')).body.readMessages,false);
  assert.deepEqual(chamadas.find(c=>c.url.includes('/webhook/set/')).body.webhook,{enabled:false,url:'',events:[]});
  assert.equal(await c.qrcode(nome),'data:image/png;base64,AAAA');const p=await c.pagina(nome,2);assert.equal(p.totalPaginas,2);
  assert.deepEqual(chamadas.at(-1).body,{page:2,offset:100});await c.remover(nome);assert.equal(chamadas.at(-1).method,'DELETE');
  const antes=chamadas.length;await assert.rejects(()=>c.remover('medico_real'));assert.equal(chamadas.length,antes);
});
test('mensagens inválidas e metadados ausentes são informados; QR não pode injetar URL',async t=>{
  t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({base64:'https://externo.test/x',records:[{}, {key:{id:'1',remoteJid:'5511999999999@s.whatsapp.net',fromMe:false},message:{conversation:'oi'}}]})));
  const c=new EvolutionColetorClient('https://evolution.test','segredo');const p=await c.pagina(nome,1);
  assert.equal(p.invalidos,1);assert.equal(p.mensagens.length,1);assert.equal(p.totalPaginas,null);assert.equal(await c.qrcode(nome),null);
});
