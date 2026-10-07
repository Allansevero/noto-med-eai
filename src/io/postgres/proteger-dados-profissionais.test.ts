import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PostgresAtendimentoRepositorio} from './postgres-atendimento-repositorio.js';

test('data recebida com snapshot antigo usa identidade profissional atual na descrição', async () => {
  let descricao=''; const passos: string[]=[];
  const query=async(sql:string, params:any[]=[])=>{
    passos.push(sql);
    if(sql.trimStart().startsWith('update solicitacoes_nota')){descricao=params[1];return {rowCount:1,rows:[]};}
    return {rows:[{nome_completo:'Ana da Silva',crm:'12345/RS',rqe:null,especialidade:null}]};
  };
  const repo=new PostgresAtendimentoRepositorio({query,connect:async()=>({query,release(){}})} as any,'fake');
  await repo.atualizarDataDescricaoSolicitacao({solicitacaoId:'sol',xdescServ:'REFERENTE A CONSULTAS MÉDICAS COM DR.(A) MÉDICO 9886 NAS DATAS 09/10/2026',fila:'pronta'});
  assert.match(descricao,/ANA DA SILVA VINCULADO CRM 12345\/RS NAS DATAS 09\/10\/2026/);
  assert.equal(passos.includes('commit'),true);
});
