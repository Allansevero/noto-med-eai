import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CadastroCertificado } from './cadastro-certificado.js';
import { PesquisaRegistroIndisponivel } from './consultas.js';
test('falha de leitura do titular vira retentativa sanitizada e preserva fila fiscal',async()=>{
 const r={trabalho:{id:'t',medico_id:'m',certificado_id:'c',documento_titular:null,dados:{}},token:'x',perfil:{nome:'Médico X',crm:null,nomeConfirmado:false}};
 let reservado=false;let resultado:any;
 const repo={agendarAtivos:async()=>{},reservar:async()=>reservado?null:(reservado=true,r),aplicar:async(_r:any,v:any)=>{resultado=v;}};
 const cadastro=new CadastroCertificado(repo as any,{consultar:async()=>{throw Error('não consultar');}},new PesquisaRegistroIndisponivel(),async()=>{throw Error('senha secreta');});
 await cadastro.recuperar();assert.equal(resultado.estado,'retentar');assert.equal(resultado.codigo,'CADASTRO_PROCESSAMENTO_FALHOU');assert.equal(JSON.stringify(resultado).includes('secreta'),false);
});
