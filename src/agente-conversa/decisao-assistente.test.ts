import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validarAcoes, decisaoAssistenteSchema } from './decisao-assistente.js';
const decisao = (dados: any, evidencia: string) => ({ intencao: 'registrar', ritmo: 'manter', assunto: 'cadastro', acoes: [{ ferramenta: 'registrar_dados', dados, evidencia }] });
test('registra nome e CRM explícitos juntos sem pesquisar', () => {
 const r=validarAcoes(decisao({nome:'Roberto Santos',crm:'12345/RS'},'Roberto Santos, CRM 12345/RS') as any,'Sou Roberto Santos, CRM 12345/RS',{etapa:'apresentacao'});
 assert.deepEqual(r.patch,{nomeConfirmado:'Roberto Santos',crmInformado:'12345/RS'});
});
test('rejeita dado inventado ou comando fora das ferramentas', () => {
 assert.deepEqual(validarAcoes(decisao({crm:'99999/SP'},'meu CRM é 12345/RS') as any,'meu CRM é 12345/RS',{etapa:'apresentacao'}).patch,{});
 assert.equal(decisaoAssistenteSchema.safeParse({intencao:'registrar',ritmo:'manter',assunto:'x',acoes:[{ferramenta:'emitir_nota',dados:{},evidencia:'emita'}]}).success,false);
});
test('dúvida com números não grava dados nem seleciona período', () => {
 const d=decisao({periodo:{quantidade:2,unidade:'meses'}},'2 meses') as any;
 assert.deepEqual(validarAcoes(d,'Por que considerar 2 meses?',{etapa:'apresentacao'}).patch,{});
});
test('sem RQE é opcional; não saber período não cria default', () => {
 assert.deepEqual(validarAcoes(decisao({rqe:null},'sem RQE') as any,'Prefiro seguir sem RQE',{etapa:'apresentacao'}).patch,{rqeInformado:null});
 assert.deepEqual(validarAcoes(decisao({periodo:{quantidade:60,unidade:'dias'}},'não sei') as any,'não sei',{etapa:'apresentacao'}).patch,{});
});
test('pergunta sobre comprovante não escolhe preferência', () => {
 assert.deepEqual(validarAcoes(decisao({preferencia:'mesma_do_comprovante'},'data do comprovante') as any,'O que acontece se usar a data do comprovante?',{etapa:'apresentacao'}).patch,{});
});
test('decisões de conversar e pausar não aceitam ações de gravação', () => {
 assert.equal(decisaoAssistenteSchema.safeParse({...decisao({crm:'123/RS'},'123/RS'),intencao:'responder'}).success,false);
});

test('negação de preferência, hipótese e dado de terceiro não gravam',()=>{
 for(const [texto,dados] of [['Não quero usar a data do comprovante',{preferencia:'mesma_do_comprovante'}],['Talvez considerar 2 meses',{periodo:{quantidade:2,unidade:'meses'}}],['Meu colega Roberto Santos tem CRM 12345/RS',{nome:'Roberto Santos',crm:'12345/RS'}]] as const){
  assert.deepEqual(validarAcoes(decisao(dados,texto) as any,texto,{etapa:'apresentacao'}).patch,{});
 }
 assert.deepEqual(validarAcoes(decisao({rqe:null},'não sei CRM') as any,'não sei CRM',{etapa:'aguardando_crm'}).patch,{});
});
test('período mensal respeita fim do mês e data de Brasília',()=>{
 const d=decisao({periodo:{quantidade:1,unidade:'meses'}},'1 mês') as any;
 assert.equal(validarAcoes(d,'1 mês',{etapa:'aguardando_janela_tempo'},new Date('2026-03-31T14:00:00Z')).patch.janelaDataCorte,'2026-02-28');
 assert.equal(validarAcoes(d,'1 mês',{etapa:'aguardando_janela_tempo'},new Date('2026-04-01T01:00:00Z')).patch.janelaDataCorte,'2026-02-28');
});
