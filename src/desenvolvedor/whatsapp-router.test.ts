import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarRouterWhatsappDesenvolvedor } from './whatsapp-router.js';
import type { EvolutionColetor } from './evolution-coletor.js';
const token='chave-de-desenvolvedor-somente-para-teste-123456';
const mensagem={key:{id:'m1',remoteJid:'5551999998888@s.whatsapp.net',fromMe:false},message:{conversation:'CPF 52998224725 e ana@example.com'}};
async function ambiente(t:any,opcoes:any={}) {
  let agora=0;const criadas:string[]=[],removidas:string[]=[];let paginas=0;
  const evolution:EvolutionColetor={async criar(n){criadas.push(n);},async estado(){return opcoes.estado||'open';},async qrcode(){return 'data:image/png;base64,AAAA';},
    async pagina(_n,p){paginas++;if(opcoes.pagina)return opcoes.pagina(p);if(opcoes.esperar)await opcoes.esperar;
      if(opcoes.falha&&p===2)throw new Error('segredo externo que não deve vazar');
      return {mensagens:p===1?[mensagem]:[],registros:p===1?1:0,invalidos:0,totalPaginas:opcoes.semMetadados?null:opcoes.falha?2:1};},
    async remover(n){if(opcoes.falhaLimpeza)throw new Error('cleanup failed');removidas.push(n);}};
  const app=express();app.use(express.json());app.use('/api',criarRouterWhatsappDesenvolvedor({ativo:opcoes.ativo??true,token,evolution,agora:()=>agora}));
  const server=await new Promise<any>(r=>{const s=app.listen(0,'127.0.0.1',()=>r(s));});
  t.after(()=>new Promise<void>(r=>{server.closeAllConnections();server.close(()=>r());}));
  const pedir=async(path:string,method='GET',chave=token)=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{Authorization:'Bearer '+chave}});return {status:res.status,data:await res.json()};};
  const iniciar=async()=>{const s=await pedir('/sessoes','POST');return s.data.sessaoId;};
  const aguardar=async(id:string)=>{for(let i=0;i<100;i++){const r=await pedir('/sessoes/'+id);if(r.data.estado!=='varrendo')return r;await new Promise<void>(r=>setImmediate(r));}throw new Error('Scan did not finish');};
  return {pedir,iniciar,aguardar,criadas,removidas,paginas:()=>paginas,avancar:()=>{agora=31*60000;}};
}
test('chave inválida e área desativada não criam instância',async t=>{
  for(const ativo of [true,false]){const a=await ambiente(t,{ativo});assert.equal((await a.pedir('/sessoes','POST','errada')).status,ativo?401:404);assert.equal(a.criadas.length,0);}
});
test('conecta instância de teste, varre, expõe JSON e encerra sem tocar em instância de médico',async t=>{
  const a=await ambiente(t),id=await a.iniciar();assert.match(a.criadas[0],/^noto_dev_coletor_[a-f0-9]{32}$/);
  assert.equal((await a.pedir('/sessoes/'+id+'/varrer','POST')).status,202);
  const r=await a.aguardar(id);assert.equal(r.data.estado,'concluida');assert.equal(r.data.contatos[0].cpfs[0].valor,'52998224725');
  assert.equal(r.data.contatos[0].emails[0].valor,'ana@example.com');assert.equal(r.data.cobertura.paginacaoConcluida,true);
  assert.equal((await a.pedir('/sessoes/'+id,'DELETE')).status,200);assert.deepEqual(a.removidas,a.criadas);
  assert.equal((await a.pedir('/sessoes/'+id)).status,410);
});
test('metadados ausentes e falha de API preservam resultado parcial e não prometem histórico completo',async t=>{
  for(const opcoes of [{semMetadados:true},{falha:true}]){const a=await ambiente(t,opcoes),id=await a.iniciar();await a.pedir('/sessoes/'+id+'/varrer','POST');
    const r=await a.aguardar(id);assert.equal(r.data.cobertura.paginacaoConcluida,false);assert.equal(r.data.contatos.length,1);
    assert.ok(['parcial','falha'].includes(r.data.estado));assert.ok(!JSON.stringify(r.data).includes('segredo externo'));
  }
});
test('não varre desconectado, bloqueia sessão expirada e permite encerrá-la',async t=>{
  const a=await ambiente(t,{estado:'close'}),id=await a.iniciar();assert.equal((await a.pedir('/sessoes/'+id+'/varrer','POST')).status,409);assert.equal(a.paginas(),0);
  a.avancar();assert.equal((await a.pedir('/sessoes/'+id)).status,410);assert.equal((await a.pedir('/sessoes/'+id,'DELETE')).status,200);
});
test('duas varreduras simultâneas não duplicam trabalho e não removem instância em leitura',async t=>{
  let resolver!:()=>void;const esperar=new Promise<void>(r=>{resolver=r;});const a=await ambiente(t,{esperar}),id=await a.iniciar();
  await a.pedir('/sessoes/'+id+'/varrer','POST');assert.equal((await a.pedir('/sessoes/'+id+'/varrer','POST')).status,409);
  assert.equal((await a.pedir('/sessoes/'+id,'DELETE')).status,409);resolver();await a.aguardar(id);assert.equal(a.paginas(),1);
  await a.pedir('/sessoes/'+id+'/varrer','POST');const r=await a.aguardar(id);assert.equal(r.data.contatos[0].cpfs[0].ocorrencias,1);
});
test('falha na limpeza mantém sessão acessível para tentar novamente',async t=>{
  const opcoes={falhaLimpeza:true};const a=await ambiente(t,opcoes),id=await a.iniciar();assert.equal((await a.pedir('/sessoes/'+id,'DELETE')).status,502);
  assert.equal((await a.pedir('/sessoes/'+id)).status,200);opcoes.falhaLimpeza=false;assert.equal((await a.pedir('/sessoes/'+id,'DELETE')).status,200);
});


test('página repetida interrompe com resultado parcial em vez de repetir até o limite',async t=>{
 const a=await ambiente(t,{pagina:()=>({mensagens:[mensagem],registros:1,invalidos:0,totalPaginas:3})}),id=await a.iniciar();
 await a.pedir('/sessoes/'+id+'/varrer','POST');const r=await a.aguardar(id);
 assert.equal(a.paginas(),2);assert.equal(r.data.estado,'parcial');assert.ok(r.data.cobertura.motivos.includes('paginacao_sem_avanco'));
 assert.equal(r.data.contatos[0].cpfs[0].ocorrencias,1);
});
test('página só de grupos não impede leitura das próximas conversas individuais',async t=>{
 const a=await ambiente(t,{pagina:(p:number)=>({mensagens:p===1?[{...mensagem,key:{...mensagem.key,remoteJid:'grupo@g.us'}}]:[mensagem],registros:1,invalidos:0,totalPaginas:2})}),id=await a.iniciar();
 await a.pedir('/sessoes/'+id+'/varrer','POST');const r=await a.aguardar(id);
 assert.equal(r.data.estado,'concluida');assert.equal(r.data.mensagensIgnoradas,1);assert.equal(r.data.contatos.length,1);
});
test('limite de páginas é explícito e impede varredura ilimitada',async t=>{
 const a=await ambiente(t,{pagina:(p:number)=>({mensagens:[{...mensagem,key:{...mensagem.key,id:'m'+p}}],registros:1,invalidos:0,totalPaginas:51})}),id=await a.iniciar();
 await a.pedir('/sessoes/'+id+'/varrer','POST');const r=await a.aguardar(id);
 assert.equal(a.paginas(),50);assert.equal(r.data.estado,'parcial');assert.ok(r.data.cobertura.motivos.includes('limite_paginas'));
 assert.equal(r.data.contatos[0].cpfs[0].ocorrencias,50);assert.equal(r.data.contatos[0].cpfs[0].origens.length,20);
});
