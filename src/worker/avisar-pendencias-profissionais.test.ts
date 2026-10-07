import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as aguardar} from 'node:timers/promises';
import {iniciarAvisosPendenciasProfissionais} from './avisar-pendencias-profissionais.js';

test('aviso inicia com servidor, não sobrepõe ciclos e para com worker',async()=>{
 let chamadas=0;let liberar!:()=>void;
 const pendente=new Promise<void>(resolve=>{liberar=resolve;});
 const avisos=iniciarAvisosPendenciasProfissionais({notificarPendentes:async()=>{chamadas++;if(chamadas===1)await pendente;}},10);
 try{
  assert.equal(chamadas,1);
  await aguardar(35);assert.equal(chamadas,1);
  liberar();await aguardar(35);assert.ok(chamadas>=2);
  avisos.parar();const total=chamadas;await aguardar(30);assert.equal(chamadas,total);
 }finally{avisos.parar();liberar();}
});
