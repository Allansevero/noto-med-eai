import { test } from 'node:test';
import assert from 'node:assert/strict';
test('revisão sugere responsável e CRM sem tratar nomes divergentes como registro do médico',async()=>{
 const modulo=await import('./revisao-painel.js').catch(()=>null);assert.ok(modulo,'deve existir revisão do painel');
 const dados:any={empresa:{cnpj:'11222333000181',razaoSocial:'Clínica',origem:'Hub',candidatos:[{nome:'Ana de Souza',origem:'Hub'}]},pesquisaProfissional:{nome:'Ana de Souza',estado:'consultado',registros:[{nomeCompleto:'Outra Pessoa',crm:'999',uf:'RS'},{nomeCompleto:'Ana de Souza',crm:'12345',uf:'RS'}]}};
 const revisao=modulo.montarRevisao({id:'t',estado:'aguardando_confirmacao',atualizado_em:'v1',dados},{nome:'Médico 6133',crm:null,rqe:null});
 assert.equal(revisao.nome,'Ana de Souza');assert.equal(revisao.crm,'12345/RS');assert.equal(revisao.aprovado,false);assert.equal(revisao.registros.length,1);
 assert.equal(modulo.montarRevisao(null,{nome:'Médico 6133',crm:null,rqe:null}).nome,'');
 const provisoria=modulo.montarRevisao({id:'t',estado:'aguardando_confirmacao',dados},{nome:'Maria de Souza',crm:'999/RS',rqe:null});
 assert.equal(provisoria.nome,'Ana de Souza');assert.equal(provisoria.crm,'12345/RS');
});

test('RQE da pesquisa nunca é combinado com outro CRM já cadastrado',async()=>{
 const {montarRevisao}=await import('./revisao-painel.js');
 const dados:any={nomeConfirmado:'Ana de Souza',pesquisaProfissional:{nome:'Ana de Souza',estado:'consultado',registros:[{nomeCompleto:'Ana de Souza',crm:'222',uf:'SC',rqe:'999'}]}};
 const r=montarRevisao({id:'t',estado:'aguardando_confirmacao',dados},{nome:'Ana de Souza',crm:'111/RS',rqe:null});
 assert.equal(r.crm,'111/RS');assert.equal(r.rqe,'');
});
