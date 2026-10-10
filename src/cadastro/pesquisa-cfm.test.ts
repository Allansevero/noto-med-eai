import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
import {CfmConsultaRegistro,CFM_BUSCA_URL,extrairRegistrosCfm} from './pesquisa-cfm.js';
test('CFM associa CRM e RQE somente ao nome completo exato e preserva múltiplos RQEs',()=>{
 const r=extrairRegistrosCfm('Ana de Souza',[
  {nome:'ANA DE SOUZA (nome de registro)',texto:'CRM: 37.341/RS Especialidade: PSIQUIATRIA - RQE Nº: 123'},
  {nome:'ANA DE SOUZA SILVA',texto:'CRM: 999/RS RQE 999'},
  {nome:'Ana de Souza',texto:'CRM: 222/SC RQE: 321 RQE: 654'},
 ]);
 assert.equal(r.length,2);assert.equal(r[0].rqe,'123');assert.equal(r[0].crm,'37341');assert.equal(r[0].verificado,false);
 assert.deepEqual(r[1].rqes,['321','654']);assert.equal(r[1].rqe,null);
});
test('RPA preenche nome completo no formulário e lê cartões CRM/RQE renderizados',async()=>{
 let pesquisado='';const fonte=new CfmConsultaRegistro('/usr/bin/chromium',async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  const original=browser.newPage.bind(browser);browser.newPage=async()=>{
   const page=await original();await page.route('**/*',async route=>{
    if(route.request().url()!==CFM_BUSCA_URL){await route.abort();return;}
    await route.fulfill({contentType:'text/html',body:`<form id="buscaForm"><input id="nome"><button type="submit">ENVIAR</button></form><div class="busca-resultado"></div><script>document.querySelector('form').onsubmit=e=>{e.preventDefault();document.querySelector('.busca-resultado').innerHTML='<div class="resultado-item"><div class="card-body"><h4>'+document.querySelector('#nome').value+'</h4><p>CRM: 37341/RS</p><p>PSIQUIATRIA - RQE: 123</p></div></div><div class="resultado-item"><div class="card-body"><h4>'+document.querySelector('#nome').value+'</h4><div><b>CRM:</b><span style="display:inline-flex">52</span>12345-6/RJ</div></div></div>';};</script>`});
   });
   const fill=page.locator.bind(page);page.locator=(selector,...args)=>{const loc=fill(selector,...args);if(selector==='#buscaForm #nome'){const originalFill=loc.fill.bind(loc);loc.fill=async(value,options)=>{pesquisado=value;return originalFill(value,options);};}return loc;};return page;
  };return browser;
 });
 const r=await fonte.buscar('Ana de Souza');assert.equal(pesquisado,'Ana de Souza');assert.equal(r.estado,'consultado');
 if(r.estado==='consultado'){assert.equal(r.dados[0].rqe,'123');assert.equal(r.dados[1].crm,'123456');assert.equal(r.dados[1].uf,'RJ');}
});
test('falha de navegador retorna diagnóstico sanitizado',async()=>{
 const r=await new CfmConsultaRegistro('inexistente',async()=>{throw Error('segredo');}).buscar('Ana de Souza');
 assert.deepEqual(r,{estado:'indisponivel',codigo:'CFM_NAVEGACAO_INDISPONIVEL'});
});
