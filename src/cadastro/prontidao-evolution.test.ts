import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assistenteConectado } from './prontidao-evolution.js';
test('prontidão exige conexão open, configuração válida e canal diferente do oficial',async()=>{
 let urls:string[]=[];
 const requisitar=(async(url:any)=>{urls.push(String(url));return new Response(JSON.stringify({instance:{state:'open'}}));}) as typeof fetch;
 const config={url:'https://evolution.exemplo',chave:'segredo',instancia:'assistente',instanciaOficial:'oficial'};
 assert.equal(await assistenteConectado(config,requisitar),true);assert.deepEqual(urls,['https://evolution.exemplo/instance/connectionState/assistente']);
 assert.equal(await assistenteConectado({...config,instancia:'oficial'},requisitar),false);assert.equal(urls.length,1);
 assert.equal(await assistenteConectado(config,(async()=>new Response(JSON.stringify({instance:{state:'close'}}))) as typeof fetch),false);
 assert.equal(await assistenteConectado(config,(async()=>{throw Error('segredo');}) as typeof fetch),false);
});
