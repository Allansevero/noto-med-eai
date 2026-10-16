import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enriquecerCadastro } from './enriquecer-cadastro.js';
import { PesquisaRegistroIndisponivel } from './consultas.js';
const perfil={nome:'Médico X',crm:null,nomeConfirmado:false};
test('CRM encontrado em página pública exige confirmação própria mesmo depois de confirmar o nome',async()=>{
 const r=await enriquecerCadastro({documento:null,perfil:{nome:'Ana de Souza',nomeConfirmado:true,crm:null},dados:{}},{consultar:async()=>{throw Error('não consultar');}},{buscar:async()=>({estado:'consultado',dados:[{nomeCompleto:'Ana de Souza',crm:'12345',uf:'RS',verificado:false}]})});
 assert.equal(r.estado,'aguardando_confirmacao');assert.equal(r.crm,undefined);assert.equal(r.dados.pendencia?.candidatos[0].crm,'12345');
});
test('pesquisa CRM pelo nome do sócio único antes da confirmação e mantém sugestões sem gravar',async()=>{
 let consultas=0;
 const empresa={consultar:async()=>({estado:'consultado' as const,dados:{cnpj:'11222333000181',razaoSocial:'Clínica',origem:'Hub',candidatos:[{nome:'Ana de Souza',origem:'Hub'}]}})};
 const registro={buscar:async(nome:string)=>{consultas++;assert.equal(nome,'Ana de Souza');return {estado:'consultado' as const,dados:[{nomeCompleto:nome,crm:'12345',uf:'RS'}]};}};
 const r=await enriquecerCadastro({documento:'11222333000181',perfil,dados:{}},empresa,registro);
 assert.equal(consultas,1);assert.equal(r.estado,'aguardando_confirmacao');assert.equal(r.nome,undefined);assert.equal(r.crm,undefined);
 assert.equal((r.dados as any).pesquisaProfissional?.registros[0].crm,'12345');
 await enriquecerCadastro({documento:'11222333000181',perfil,dados:r.dados},empresa,registro);assert.equal(consultas,1);
});
test('aguarda identificação quando o Hub retorna vários candidatos e não pesquisa nomes ambíguos',async()=>{
 let consultas=0;
 const empresaMultipla={consultar:async()=>({estado:'consultado' as const,dados:{cnpj:'11222333000181',razaoSocial:'Clínica',origem:'Hub',candidatos:[{nome:'Ana de Souza',origem:'Hub'},{nome:'Beatriz Lima',origem:'Hub'}]}})};
 const r=await enriquecerCadastro({documento:'11222333000181',perfil,dados:{}},empresaMultipla,{buscar:async()=>{consultas++;return {estado:'consultado',dados:[]};}});
 assert.equal(consultas,0);assert.deepEqual(r.dados.pendencia?.candidatos.map(c=>c.nome),['Ana de Souza','Beatriz Lima']);
});
test('pesquisa Serper não marca sugestão como validada nem salva CRM automaticamente',async()=>{
 const r=await enriquecerCadastro({documento:null,perfil:{nome:'Ana de Souza',nomeConfirmado:true,crm:null},dados:{}},{consultar:async()=>{throw Error('não consultar empresa');}},{buscar:async()=>({estado:'consultado',dados:[{nomeCompleto:'Ana de Souza',crm:'30858',uf:'SC',verificado:false,origem:'Google via Serper (sugestão não oficial)'}]})});
 assert.equal(r.estado,'aguardando_confirmacao');assert.equal(r.crm,undefined);assert.equal(r.dados.crmOrigem,undefined);
 assert.equal(r.dados.pesquisaProfissional?.registros[0].verificado,false);
});
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

test('pesquisa explícita atualiza resultado vazio mesmo com CRM existente sem sobrescrever perfil',async()=>{
 let chamadas=0;
 const r=await enriquecerCadastro({documento:null,perfil:{nome:'Maria Silva',nomeConfirmado:true,crm:'37341/RS',rqe:null},
  dados:{nomeConfirmado:'Maria Silva',pesquisaSolicitadaPainel:true}},empresa,{buscar:async()=>{chamadas++;return {estado:'consultado',dados:[{nomeCompleto:'Maria Silva',crm:'37341',uf:'RS',rqe:'12345',verificado:false}]};}});
 assert.equal(chamadas,1);assert.equal(r.estado,'concluido');assert.equal(r.crm,undefined);assert.equal(r.rqe,undefined);
 assert.equal(r.dados.pesquisaProfissional?.registros[0].rqe,'12345');
 assert.equal(r.dados.pesquisaSolicitadaPainel,undefined);
});
test('pesquisa explícita indisponível mantém dados confirmados e código de erro para retomada',async()=>{
 const r=await enriquecerCadastro({documento:null,perfil:{nome:'Maria Silva',nomeConfirmado:true,crm:'37341/RS',rqe:'12345'},
  dados:{nomeConfirmado:'Maria Silva',pesquisaSolicitadaPainel:true}},empresa,{buscar:async()=>({estado:'indisponivel',codigo:'SERPER_HTTP_429'})});
 assert.equal(r.estado,'retentar');assert.equal(r.dados.pesquisaProfissional?.codigo,'SERPER_HTTP_429');
 assert.equal(r.crm,undefined);assert.equal(r.rqe,undefined);
});

test('créditos Serper esgotados permitem revisão manual sem retentativa automática',async()=>{
 let chamadas=0;const diagnostico=[{etapa:'serper_http' as const,status:400,motivo:'CREDITOS_INSUFICIENTES' as const}];
 const fonte={buscar:async()=>{chamadas++;return{estado:'indisponivel' as const,codigo:'SERPER_HTTP_400',diagnostico};}};
 const entrada={documento:null,perfil:{nome:'Maria Silva',nomeConfirmado:true,crm:null},dados:{nomeConfirmado:'Maria Silva'}};
 const r=await enriquecerCadastro(entrada,empresa,fonte);assert.equal(r.estado,'aguardando_confirmacao');
 assert.equal(r.dados.pendencia?.tipo,'crm');assert.equal(chamadas,1);
 const repetida=await enriquecerCadastro({...entrada,dados:r.dados},empresa,fonte);
 assert.equal(repetida.estado,'aguardando_confirmacao');assert.equal(chamadas,1);
});
test('falta de créditos antes de confirmar responsável também mantém pesquisa em cache',async()=>{
 let chamadas=0;const fonte={buscar:async()=>{chamadas++;return{estado:'indisponivel' as const,codigo:'SERPER_HTTP_400',diagnostico:[{etapa:'serper_http' as const,status:400,motivo:'CREDITOS_INSUFICIENTES' as const}]};}};
 const entrada={documento:'11222333000181',perfil:{nome:'Cadastro provisório',nomeConfirmado:false,crm:null},dados:{}};
 const r=await enriquecerCadastro(entrada,empresa,fonte);assert.equal(r.estado,'aguardando_confirmacao');
 await enriquecerCadastro({...entrada,dados:r.dados},empresa,fonte);assert.equal(chamadas,1);
});
