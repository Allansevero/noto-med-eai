import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extrairDadosTribemd } from './tribemd-dados.js';
test('extrai pacientes de campos nomeados sem incorporar prontuário e valida CPF e telefone',()=>{
 const r=extrairDadosTribemd({url:'https://app.tribemd.com/pacientes',campos:[],tabelas:[{colunas:['Nome','CPF','E-mail','Telefone','Anamnese'],linhas:[['Ana Silva','529.982.247-25','ana@example.com','(51) 98123-4567','conteúdo clínico'],['Bia','11111111111','','','']]}]},'2026-10-07','2026-10-14');
 assert.equal(r.pacientes[0].cpf,'52998224725');assert.equal(r.pacientes[0].telefone,'5551981234567');
 assert.equal(r.pacientes[1].cpf,null);assert.ok(r.pacientes[1].pendencias.includes('cpf_invalido'));
 assert.ok(!JSON.stringify(r).includes('conteúdo clínico'));assert.equal(r.agendamentos.length,0);
});
test('filtra datas de agendamentos sem presumir atendimento, pagamento ou fuso',()=>{
 const r=extrairDadosTribemd({url:'https://app.tribemd.com/agenda',campos:[],tabelas:[{colunas:['Paciente','Data','Horário','Status'],linhas:[['Ana','08/10/2026','14:00','Agendado'],['Bia','30/10/2026','12:00','Cancelado']]}]},'2026-10-07','2026-10-14');
 assert.equal(r.agendamentos.length,1);assert.equal(r.agendamentos[0].data,'2026-10-08');assert.equal(r.agendamentos[0].fuso,null);
 assert.equal(r.agendamentos[0].situacao,'Agendado');assert.equal(r.agendamentos[0].pacienteId,null);
});
test('campos de um cadastro têm evidência e não transformam o telefone em CPF',()=>{
 const r=extrairDadosTribemd({url:'https://app.tribemd.com/pacientes/1',campos:[{rotulo:'Nome completo',valor:'Ana'},{rotulo:'E-mail',valor:'ana@example.com'},{rotulo:'Celular',valor:'51981234567'},{rotulo:'Senha',valor:'segredo'}],tabelas:[]},'2026-10-07','2026-10-14');
 assert.equal(r.pacientes.length,1);assert.equal(r.pacientes[0].cpf,null);assert.equal(r.pacientes[0].origem[0].pagina,'https://app.tribemd.com/pacientes/1');
 assert.ok(!JSON.stringify(r).includes('segredo'));
});
