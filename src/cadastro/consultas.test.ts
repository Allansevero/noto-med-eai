import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrasilApiConsultaEmpresa, PesquisaRegistroIndisponivel, lerRespostaHubCnpj } from './consultas.js';
const cnpj='11222333000181';
const fetcher=(json:unknown,status=200) => (async()=>new Response(JSON.stringify(json),{status})) as typeof fetch;
test('quadro societário vira candidatos, sem promover sócio a médico',async()=>{
 const r=await new BrasilApiConsultaEmpresa(fetcher({cnpj,razao_social:'Clínica',qsa:[{nome_socio:'Ana de Souza'},{nome_socio:'Marcos Oliveira'}]})).consultar(cnpj);
 assert.equal(r.estado,'consultado');if(r.estado==='consultado'){assert.deepEqual(r.dados.candidatos.map(c=>c.nome),['Ana de Souza','Marcos Oliveira']);assert.equal('medico' in r.dados,false);}
});
test('documento divergente, sócio PJ e resposta inválida não identificam médico',async()=>{
 assert.equal((await new BrasilApiConsultaEmpresa(fetcher({cnpj:'99999999000199',razao_social:'Outra'})).consultar(cnpj)).estado,'indisponivel');
 const r=await new BrasilApiConsultaEmpresa(fetcher({cnpj,razao_social:'Clínica',qsa:[{nome_socio:'Clínica Parceira LTDA',identificador_de_socio:1}]})).consultar(cnpj);
 assert.equal(r.estado,'consultado');if(r.estado==='consultado')assert.deepEqual(r.dados.candidatos,[]);
 assert.equal((await new BrasilApiConsultaEmpresa(fetcher({},429)).consultar(cnpj)).estado,'indisponivel');
 assert.equal((await new BrasilApiConsultaEmpresa((async()=>{throw Error('segredo');}) as typeof fetch).consultar(cnpj)).estado,'indisponivel');
});
test('parser do contrato público do Hub aceita sócios com qualificação sem reconstruir CPF',()=>{
 const r=lerRespostaHubCnpj({status:'true',result:{numero_de_inscricao:cnpj,nome:'Clínica',quadro_socios:['ANA DE SOUZA 49-Sócio-Administrador']}},cnpj);
 assert.equal(r.estado,'consultado');if(r.estado==='consultado')assert.deepEqual(r.dados.candidatos,[{nome:'ANA DE SOUZA',origem:'Hub do Desenvolvedor / quadro_socios'}]);
 assert.equal(lerRespostaHubCnpj({status:true,result:{numero_de_inscricao:'99999999000199',nome:'Outra'}},cnpj).estado,'indisponivel');
});
test('pesquisa indisponível não fabrica CRM nem UF',async()=>{
 assert.deepEqual(await new PesquisaRegistroIndisponivel().buscar('Ana de Souza'),{estado:'indisponivel',codigo:'CRM_FONTE_NAO_CONFIGURADA'});
});
