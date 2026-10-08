import {test} from 'node:test';
import assert from 'node:assert/strict';
import type pg from 'pg';
import {PostgresComunicadorNoto} from './postgres-comunicador-noto.js';
import type {ContextoMensagemNoto, EntradaComunicacaoNoto} from '../../conversa/comunicador-noto.js';

function fixture(op:{missingCase?:boolean;history?:any[];patient?:boolean;sendFailAt?:number;output?:unknown;throwIA?:boolean}={}) {
  let state:string|undefined;let output:unknown;let storedInput:unknown; const events:any[]=[]; const sends:any[]=[]; const contexts:ContextoMensagemNoto[]=[]; const sqls:string[]=[];
  const pool={query:async(sql:string,args:any[]=[])=>{
    sqls.push(sql);
    if(sql.includes('from medicos m join usuarios'))return {rows:[{nome_completo:'Dra. Lia',crm:'123/SP',rqe:null,telefone:'5511999999999'}]};
    if(sql.includes('from solicitacoes_nota s join pacientes')){assert.equal(args[0],'med-a'); return {rows:op.missingCase?[]:[{id:'sol-a',nome:'Ana',telefone:'5511888888888',valor_servico_centavos:12345,datas_consulta_texto:'07/10/2026',status:'pendente',aguardando_dados_profissionais:true,aguardando_confirmacao_medico:false}]};}
    if(sql.includes('count(*)'))return {rows:[{quantidade:2}]};
    if(sql.includes('from pacientes p join whatsapp_instancias'))return {rows:op.patient?[{telefone:'5511888888888',nome_instancia:'med-a-inst'}]:[]};
    if(sql.startsWith('insert into noto_comunicacoes')) {if(state && state!=='falha_ia')return {rows:[]};state='gerando';storedInput=JSON.parse(args[3]);return {rows:[{id:'com-a'}]};}
    if(sql.startsWith('select estado'))return {rows:[{estado:state}]};
    if(sql.includes('select entrada, mensagens')){assert.equal(args[0],'med-a');return {rows:op.history??[]};}
    if(sql.startsWith('update noto_comunicacoes')){state=args[1];if(sql.includes('mensagens=$3'))output=JSON.parse(args[2]);if(sql.includes('entrada=$3'))storedInput=JSON.parse(args[2]);if(sql.includes('eventos=eventos'))events.push(JSON.parse(args[2]));return {rows:[{id:'com-a'}],rowCount:1};}
    throw new Error(`Unexpected SQL ${sql}`);
  }} as unknown as pg.Pool;
  const sut=new PostgresComunicadorNoto(pool,{enviarTexto:async p=>{assert.equal(state,'reservado');assert.ok(output);sends.push(p);if(op.sendFailAt===sends.length)throw new Error('network');return {sucesso:true};}},'oficial',{gerar:async c=>{contexts.push(c);if(op.throwIA)throw new Error('IA secret');return (op.output??['Ana: consulta de R$ 123,45. Pode informar seu nome completo?']) as string[];}});
  const entrada:EntradaComunicacaoNoto={medicoId:'med-a',chave:'evt-1',evento:'pedir_nome',solicitacaoId:'sol-a',mensagemRecebida:'Oi',dados:{nome:'Lia',cpf:'12345678901',token:'secret',url:'https://example.com'}};
  return {sut,entrada,sends,contexts,events,sqls,state:()=>state,storedInput:()=>storedInput,output:()=>output};
}
test('uses authoritative profile, owned case, official phone and sanitized physician history',async()=>{
 const f=fixture({history:[{entrada:{destinatario:'paciente',mensagemRecebida:'CPF privado'},mensagens:['Paciente privado']},{entrada:{destinatario:'medico',mensagemRecebida:'Mais recente'},mensagens:['Resposta recente']},{entrada:{destinatario:'medico',mensagemRecebida:'Antiga'},mensagens:['Resposta antiga']}]});
 assert.deepEqual(await f.sut.enviar(f.entrada),{sucesso:true,envioIniciado:true});const c=f.contexts[0];
 assert.deepEqual(c.medico,{nome:'Dra. Lia',crm:'123/SP',rqe:null});assert.equal(c.caso?.valorCentavos,12345);assert.equal(c.caso?.nomePaciente,'Ana');assert.equal(c.quantidadeNotasParadas,2);
 assert.deepEqual(c.dados,{nome:'Lia'});assert.deepEqual(c.historico,[{papel:'medico',texto:'Antiga'},{papel:'noto',texto:'Resposta antiga'},{papel:'medico',texto:'Mais recente'},{papel:'noto',texto:'Resposta recente'}]);assert.equal(f.sends[0].contatoTelefone,'5511999999999');assert.equal(f.sends[0].instanciaNome,'oficial');
 assert.equal(f.sqls.some(s=>/^update (medicos|solicitacoes_nota)/.test(s)),false);
});
test('foreign explicit case fails without choosing another case or generating',async()=>{const f=fixture({missingCase:true});assert.deepEqual(await f.sut.enviar(f.entrada),{sucesso:false,envioIniciado:false});assert.equal(f.contexts.length,0);assert.equal(f.sends.length,0);});
test('generation failure is retryable and never sends fallback text',async()=>{const f=fixture({throwIA:true});assert.deepEqual(await f.sut.enviar(f.entrada),{sucesso:false,envioIniciado:false});assert.equal(f.state(),'falha_ia');assert.equal(f.sends.length,0);});
test('concurrent repeated key generates and sends once',async()=>{const f=fixture();const results=await Promise.all([f.sut.enviar(f.entrada),f.sut.enviar(f.entrada)]);assert.equal(f.contexts.length,1);assert.equal(f.sends.length,1);assert.equal(results.some(r=>r.sucesso),true);assert.equal(results.every(r=>r.envioIniciado),true);assert.deepEqual(await f.sut.enviar(f.entrada),{sucesso:true,envioIniciado:true});assert.equal(f.sends.length,1);});
test('partial transport failure stores uncertain events and never repeats',async()=>{const f=fixture({output:['Ana: R$ 123,45.','Outra mensagem'],sendFailAt:2});assert.deepEqual(await f.sut.enviar(f.entrada),{sucesso:false,envioIniciado:true});assert.equal(f.state(),'incerto');assert.equal(f.events.length,2);assert.deepEqual(await f.sut.enviar(f.entrada),{sucesso:false,envioIniciado:true});assert.equal(f.sends.length,2);});
for(const output of [[],['Sem paciente nem valor'],['Ana R$ 999,00'],['Ana R$ 123,45: nota emitida'],['Ana R$ 123,45: suporte encaminhado'],[123],['Ana R$ 123,45 '+ 'x'.repeat(500)],['Ana R$ 123,45','2','3','4']])test('rejects malformed or ungrounded generator output '+JSON.stringify(output).slice(0,50),async()=>{const f=fixture({output});assert.equal((await f.sut.enviar(f.entrada)).envioIniciado,false);assert.equal(f.sends.length,0);});
test('patient send requires owned patient and instance',async()=>{const f=fixture();assert.deepEqual(await f.sut.enviar({...f.entrada,evento:'pedir_cpf',pacienteId:'patient-b',instanciaPaciente:'other-inst'}),{sucesso:false,envioIniciado:false});assert.equal(f.sends.length,0);});
test('verified patient CPF event uses patient phone and excludes medical history',async()=>{const f=fixture({patient:true,history:[{entrada:{destinatario:'medico',mensagemRecebida:'privado'},mensagens:['segredo']}]});assert.equal((await f.sut.enviar({...f.entrada,evento:'pedir_cpf',pacienteId:'patient-a',instanciaPaciente:'med-a-inst'})).sucesso,true);assert.equal(f.contexts[0].destinatario,'paciente');assert.deepEqual(f.contexts[0].historico,[]);assert.equal(f.sends[0].contatoTelefone,'5511888888888');});
test('amount matching rejects a larger amount containing the actual value',async()=>{const f=fixture({output:['Ana R$ 1123,45']});assert.equal((await f.sut.enviar(f.entrada)).envioIniciado,false);assert.equal(f.sends.length,0);});
test('dedupe outcome stays stable if the owned case disappears later',async()=>{const op={missingCase:false};const f=fixture(op);assert.equal((await f.sut.enviar(f.entrada)).sucesso,true);op.missingCase=true;assert.deepEqual(await f.sut.enviar(f.entrada),{sucesso:true,envioIniciado:true});assert.equal(f.sends.length,1);});
test('non CPF events cannot select a patient recipient',async()=>{const f=fixture({patient:true});assert.deepEqual(await f.sut.enviar({...f.entrada,pacienteId:'patient-a',instanciaPaciente:'med-a-inst'}),{sucesso:false,envioIniciado:false});assert.equal(f.sends.length,0);});
test('missing implicit held case permits a general conversation',async()=>{const f=fixture({missingCase:true,output:['Como posso ajudar?']});assert.equal((await f.sut.enviar({...f.entrada,evento:'conversa',solicitacaoId:undefined})).sucesso,true);assert.equal(f.contexts[0].caso,null);assert.ok(f.sqls.some(s=>s.includes('order by s.criado_em') && s.includes('s.aguardando_dados_profissionais or s.aguardando_confirmacao_medico')));});
test('follow-up conversation does not require repeating patient and amount',async()=>{const f=fixture({output:['Pode me dizer o que deseja esclarecer?']});assert.equal((await f.sut.enviar({...f.entrada,evento:'conversa'})).sucesso,true);});
test('sanitizes keys and technical material and bounds received text/history',async()=>{const f=fixture({history:[{entrada:{destinatario:'medico',mensagemRecebida:'a'.repeat(3000)},mensagens:['b'.repeat(3000)]}]});await f.sut.enviar({...f.entrada,mensagemRecebida:'https://example.com token=secret SELECT password FROM usuarios\n'+ 'c'.repeat(3000),dados:{certificado:'private',sql:'select',endpoint:'url',normal:'https://example.com',cpf:'12345678901'}});assert.equal(f.contexts[0].mensagemRecebida?.length,2000);assert.equal(f.contexts[0].mensagemRecebida,'c'.repeat(2000));assert.deepEqual(f.contexts[0].dados,{});assert.deepEqual(f.contexts[0].historico.map(h=>h.texto.length),[2000,2000]);});
test('allows truthful failure and future instructions using emitir',async()=>{const f=fixture({output:['Ana, R$ 123,45. Não consegui emitir a nota; preciso do seu nome completo para emitir depois.']});assert.equal((await f.sut.enviar(f.entrada)).sucesso,true);});
test('limit before case creation anchors current request instead of another held case',async()=>{const f=fixture({output:['Bruna, R$ 250,00: você atingiu o limite de emissões.']});assert.equal((await f.sut.enviar({...f.entrada,evento:'limite_emissao',solicitacaoId:undefined,dados:{nomePaciente:'Bruna',telefonePaciente:'5511777777777',valorCentavos:25000,motivo:'limite'}})).sucesso,true);assert.equal(f.contexts[0].caso,null);assert.equal(f.sqls.some(s=>s.includes('from solicitacoes_nota s join pacientes')),false);});
test('limit before case creation rejects another patient and amount',async()=>{const f=fixture();assert.equal((await f.sut.enviar({...f.entrada,evento:'limite_emissao',solicitacaoId:undefined,dados:{nomePaciente:'Bruna',telefonePaciente:'5511777777777',valorCentavos:25000}})).envioIniciado,false);assert.equal(f.sends.length,0);});

test('uncertain history excludes rejected and unattempted balloons',async()=>{
 const previous=fixture({output:['Ana R$ 123,45.','Transporte recusou esta.','Nem tentou esta.'],sendFailAt:2});
 assert.deepEqual(await previous.sut.enviar(previous.entrada),{sucesso:false,envioIniciado:true});
 assert.equal(previous.sends.length,2);
 const future=fixture({history:[{estado:previous.state(),entrada:previous.storedInput(),mensagens:previous.output(),eventos:previous.events.flat()}]});
 await future.sut.enviar({...future.entrada,chave:'evt-2'});
 assert.deepEqual(future.contexts[0].historico,[{papel:'medico',texto:'Oi'},{papel:'noto',texto:'Ana R$ 123,45.'}]);
});
test('persists the complete bounded context supplied to the generator',async()=>{
 const f=fixture({history:[{estado:'enviado',entrada:{destinatario:'medico',mensagemRecebida:'Recebida'},mensagens:['Resposta anterior']}]});
 await f.sut.enviar(f.entrada);
 assert.equal(f.contexts[0].historico.length,2);
 assert.deepEqual(f.storedInput(),f.contexts[0]);
});
test('patient CPF context excludes physician profile and internal pending facts',async()=>{
 const f=fixture({patient:true});
 assert.equal((await f.sut.enviar({...f.entrada,evento:'pedir_cpf',pacienteId:'patient-a',instanciaPaciente:'med-a-inst',dados:{crm:'123/SP',rqe:'999',quantidadeNotasParadas:8}})).sucesso,true);
 const c=f.contexts[0];assert.deepEqual(c.medico,{nome:null,crm:null,rqe:null});assert.equal(c.quantidadeNotasParadas,0);
 assert.equal(c.caso?.aguardandoDadosProfissionais,false);assert.equal(c.caso?.aguardandoConfirmacao,false);assert.deepEqual(c.dados,{});
});
for(const output of ['Ana, o CRM do médico é 123/SP.','Ana, falta RQE.','Ana, faltam dados profissionais do médico.','Ana, existem outras notas pendentes.','Ana, aguardo a confirmação do médico.'])test('patient output rejects internal disclosure '+output,async()=>{
 const f=fixture({patient:true,output:[output]});
 assert.deepEqual(await f.sut.enviar({...f.entrada,evento:'pedir_cpf',pacienteId:'patient-a',instanciaPaciente:'med-a-inst'}),{sucesso:false,envioIniciado:false});assert.equal(f.sends.length,0);
});
for(const cnpj of ['12.345.678/0001-90','12345678000190']){
 test('strips CNPJ from received text and supplied data '+cnpj,async()=>{const f=fixture();await f.sut.enviar({...f.entrada,mensagemRecebida:'Oi '+cnpj,dados:{diagnostico:cnpj}});assert.equal(f.contexts[0].mensagemRecebida,'Oi');assert.deepEqual(f.contexts[0].dados,{});assert.equal(JSON.stringify(f.storedInput()).includes(cnpj),false);});
 test('rejects generated CNPJ disclosure '+cnpj,async()=>{const f=fixture({output:['Ana R$ 123,45. CNPJ '+cnpj]});assert.deepEqual(await f.sut.enviar(f.entrada),{sucesso:false,envioIniciado:false});assert.equal(f.sends.length,0);});
}
