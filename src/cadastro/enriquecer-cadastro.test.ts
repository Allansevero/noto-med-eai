import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enriquecerCadastro } from './enriquecer-cadastro.js';
import { PesquisaRegistroIndisponivel } from './consultas.js';
const perfil={nome:'Médico X',crm:null,nomeConfirmado:false};
const empresa={consultar:async()=>({estado:'consultado' as const,dados:{cnpj:'11222333000181',razaoSocial:'Clínica',origem:'fonte',candidatos:[{nome:'Ana de Souza',origem:'fonte'}]}})};
test('sócio único gera confirmação de vínculo antes de salvar pessoa',async()=>{
 const r=await enriquecerCadastro({documento:'11222333000181',perfil,dados:{}},empresa,new PesquisaRegistroIndisponivel());
 assert.equal(r.estado,'aguardando_confirmacao');assert.equal(r.dados.pendencia?.tipo,'responsavel');assert.equal(r.nome,undefined);assert.equal(r.dados.empresa?.razaoSocial,'Clínica');
});
test('dados já confirmados dispensam coleta e não são sobrescritos pela empresa',async()=>{
 const r=await enriquecerCadastro({documento:'11222333000181',perfil:{nome:'Maria Silva',nomeConfirmado:true,crm:'37341/RS'},dados:{}},empresa,new PesquisaRegistroIndisponivel());
 assert.equal(r.estado,'concluido');assert.equal(r.nome,undefined);assert.equal(r.crm,undefined);
});
test('indisponibilidade cadastral é retentável e não produz pergunta imediata',async()=>{
 const r=await enriquecerCadastro({documento:'11222333000181',perfil,dados:{}},{consultar:async()=>({estado:'indisponivel',codigo:'TIMEOUT'})},new PesquisaRegistroIndisponivel());
 assert.equal(r.estado,'retentar');assert.equal(r.dados.pendencia,undefined);
});
test('pesquisa indisponível após identificar médico pede apenas CRM; não retoma onboarding',async()=>{
 const r=await enriquecerCadastro({documento:'11222333000181',perfil,dados:{empresa:(await empresa.consultar()).dados,nomeConfirmado:'Ana de Souza'}},empresa,new PesquisaRegistroIndisponivel());
 assert.equal(r.dados.pendencia?.tipo,'crm');assert.equal(r.dados.pendencia?.candidatos.length,0);
});
test('homônimos/registro divergente exigem escolha e não são salvos automaticamente',async()=>{
 const r=await enriquecerCadastro({documento:null,perfil,dados:{nomeConfirmado:'Ana de Souza'}},empresa,{buscar:async()=>({estado:'consultado',dados:[{nomeCompleto:'Ana de Souza',crm:'12345',uf:'RS'},{nomeCompleto:'Ana de Souza',crm:'54321',uf:'SP'}]})});
 assert.equal(r.dados.pendencia?.tipo,'crm');assert.equal(r.dados.pendencia?.candidatos.length,2);assert.equal(r.crm,undefined);
});
