import {test} from 'node:test';
import assert from 'node:assert/strict';
async function fonte(fetcher:typeof fetch,token='token-sintetico'){
 const m=await import('./infosimples.js').catch(()=>null);assert.ok(m,'adaptador Infosimples deve existir');return new m.InfosimplesConsultaRegistro(token,fetcher);
}
const item={nome:'ANA DE SOUZA',inscricao:'1111',endereco_uf:'RJ',primeira_inscricao_uf_data:'SP',especialidade_lista:['CLÍNICA MÉDICA - RQE Nº: 222','ENDOCRINOLOGIA - RQE Nº: 222'],situacao:'Regular'};
const resposta=(data:unknown[],parameters:unknown={nome:'Ana de Souza'})=>new Response(JSON.stringify({code:200,data_count:data.length,data,header:{parameters}}));
test('consulta nome por POST e confirma UF com pesquisa restrita, sem usar UF do endereço',async()=>{
 const pedidos:URLSearchParams[]=[];
 const s=await fonte((async(url,o)=>{assert.equal(String(url),'https://api.infosimples.com/api/v2/consultas/cfm/cadastro');assert.equal(o?.method,'POST');const p=new URLSearchParams(String(o?.body));pedidos.push(p);return resposta([item],Object.fromEntries([...p].filter(([k])=>k!=='token')));}) as typeof fetch);
 const r=await s.buscar('Ana de Souza');assert.equal(r.estado,'consultado');assert.equal(pedidos.length,2);assert.equal(pedidos[0].get('nome'),'Ana de Souza');assert.equal(pedidos[0].has('uf'),false);assert.equal(pedidos[1].get('uf'),'SP');assert.equal(pedidos[1].get('token'),'token-sintetico');
 if(r.estado==='consultado'){assert.equal(r.dados[0].uf,'SP');assert.equal(r.dados[0].rqe,'222');assert.equal(r.dados[0].verificado,false);}
});
test('não associa inscrição à UF do endereço quando falta fonte para restringir a busca',async()=>{
 const s=await fonte((async()=>resposta([{...item,primeira_inscricao_uf_data:''}])) as typeof fetch);
 assert.deepEqual(await s.buscar('Ana de Souza'),{estado:'indisponivel',codigo:'INFOSIMPLES_UF_NAO_CONFIRMADA'});
});
test('não reaproveita resultado parcial se segunda consulta diverge de nome ou UF',async()=>{
 let chamadas=0;const s=await fonte((async()=>++chamadas===1?resposta([item]):resposta([{...item,nome:'Outra Pessoa'}],{uf:'SP'})) as typeof fetch);
 assert.equal((await s.buscar('Ana de Souza')).estado,'indisponivel');
});
test('inscrição já contém UF e múltiplos RQEs não são escolhidos automaticamente',async()=>{
 let chamadas=0;const s=await fonte((async()=>{chamadas++;return resposta([{...item,inscricao:'1111/SP',especialidade_lista:['PSIQUIATRIA - RQE Nº: 222','PSICOTERAPIA - RQE Nº: 333']}]);}) as typeof fetch);
 const r=await s.buscar('Ana de Souza');assert.equal(chamadas,1);assert.equal(r.estado,'consultado');if(r.estado==='consultado'){assert.equal(r.dados[0].rqe,null);assert.deepEqual(r.dados[0].rqes,['222','333']);}
});
test('ausência de token não envia consulta; erros do provedor são sanitizados',async()=>{
 const s=await fonte((async()=>{throw Error('não deve consultar');}) as typeof fetch,'');assert.equal((await s.buscar('Ana de Souza')).estado,'indisponivel');
 const falha=await fonte((async()=>new Response(JSON.stringify({code:600,errors:['segredo token-sintetico']}))) as typeof fetch);
 assert.deepEqual(await falha.buscar('Ana de Souza'),{estado:'indisponivel',codigo:'INFOSIMPLES_API_600'});
});
test('zero resultados é distinto de resposta malformada ou múltiplos registros',async()=>{
 assert.deepEqual(await (await fonte((async()=>resposta([])) as typeof fetch)).buscar('Ana de Souza'),{estado:'nao_encontrado',codigo:'INFOSIMPLES_NAO_ENCONTRADO'});
 for(const corpo of [{code:200,data_count:1,data:[]},{code:200,data_count:2,data:[item,item]}]){
  assert.equal((await (await fonte((async()=>new Response(JSON.stringify(corpo))) as typeof fetch)).buscar('Ana de Souza')).estado,'indisponivel');
 }
});
test('UF divergente na resposta da consulta restrita é rejeitada',async()=>{
 const s=await fonte((async()=>resposta([item],{uf:'RJ'})) as typeof fetch);
 assert.deepEqual(await s.buscar('Ana de Souza','SP'),{estado:'indisponivel',codigo:'INFOSIMPLES_UF_NAO_CONFIRMADA'});
});
test('segunda consulta vazia encaminha preenchimento manual sem retentativas pagas',async()=>{
 let n=0;const s=await fonte((async()=>++n===1?resposta([item]):resposta([],{uf:'SP'})) as typeof fetch);
 assert.deepEqual(await s.buscar('Ana de Souza'),{estado:'nao_encontrado',codigo:'INFOSIMPLES_NAO_ENCONTRADO'});
});
