import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresDadosProfissionaisService } from './postgres-dados-profissionais-service.js';
function ambiente(opcoes: {nome?:string;crm?:string;pendente?:boolean;falhar?:boolean;telefone?:string;falharUsuario?:boolean;concluido?:boolean;datas?:string|null;legado?:string;datasAgenda?:string|null;semSolicitacoes?:boolean;confirmacao?:boolean;capturadaEm?:Date;comunicador?:any} = {}) {
  let medico = {id:'11111111-1111-4111-8111-111111111111',usuario_id:'22222222-2222-4222-8222-222222222222',nome_completo:opcoes.nome??'Médico 9886',crm:opcoes.crm??null,rqe:null,especialidade:'Cardiologia',telefone:opcoes.telefone??'5551999999999'};
  let pendencia = opcoes.concluido ? {estado:'concluido'} : opcoes.pendente ? {estado:'enviado'} : null;
  let revisao: any = opcoes.confirmacao ? {estado:'pendente', capturada_em:opcoes.capturadaEm??new Date('2026-10-07T00:00:00Z')} : null;
  let aguardaConfirmacao=Boolean(opcoes.confirmacao);
  const mensagens = new Set<string>(); const envios:any[]=[]; const updates:any[]=[]; const queries:string[]=[];
  let emTransacao=false; let snapshot:any; let retida=!opcoes.semSolicitacoes;
  const client = {release(){},async query(sql:string,p:any[]=[]):Promise<any>{
    queries.push(sql);
    if(sql==='begin')emTransacao=true;
    if(sql==='commit'||sql==='rollback')emTransacao=false;
    if(sql==='begin') snapshot={medico:{...medico},pendencia:pendencia&&{...pendencia},mensagens:new Set(mensagens)};
    if(sql==='rollback'){medico=snapshot.medico;pendencia=snapshot.pendencia;mensagens.clear();for(const m of snapshot.mensagens)mensagens.add(m);}
    if(sql.includes('from medicos m') && sql.includes('for update')) return {rows:[{...medico}]};
    if(sql.includes('from emissoes_pendentes_confirmacoes'))return {rows:revisao?[{...revisao}]:[]};
    if(sql.startsWith('update emissoes_pendentes_confirmacoes')){if(!revisao)return {rows:[],rowCount:0};if(sql.includes("set estado='reservado'") && revisao.estado!=='pendente')return {rows:[],rowCount:0};revisao.estado=sql.includes("set estado='confirmado'")?'confirmado':p[1]??'reservado';return {rows:[{medico_id:p[0]}],rowCount:1};}
    if(sql.startsWith('update solicitacoes_nota set aguardando_confirmacao_medico')){aguardaConfirmacao=false;return {rows:[],rowCount:1};}
    if(sql.startsWith('select estado')) return {rows:pendencia?[{...pendencia}]:[]};
    if(sql.startsWith('insert into dados_profissionais_pendencias')){if(pendencia && !(pendencia.estado==='concluido' && sql.includes("where dados_profissionais_pendencias.estado='concluido'")))return {rows:[]};pendencia={estado:'reservado'};return {rows:[{medico_id:p[0]}]};}
    if(sql.startsWith('delete from dados_profissionais_pendencias')){if(pendencia?.estado==='reservado')pendencia=null;return {rows:[],rowCount:1};}
    if(sql.startsWith('update dados_profissionais_pendencias')){if(pendencia)pendencia.estado=p[1]??'concluido';return {rows:[],rowCount:1};}
    if(sql.startsWith('insert into dados_profissionais_mensagens')){const chave=p[0]+':'+p[1];if(mensagens.has(chave))return {rows:[]};mensagens.add(chave);return {rows:[{mensagem_id:p[1]}]};}
    if(sql.startsWith('update medicos')){medico.nome_completo=p[1]??medico.nome_completo;medico.crm=p[2]??medico.crm;medico.rqe=p[3]??medico.rqe;return {rows:[{...medico}]};}
    if(sql.startsWith('update usuarios')){if(opcoes.falharUsuario)throw Error('usuario falhou');assert.equal(p[0],'22222222-2222-4222-8222-222222222222');return {rows:[{id:p[0]}],rowCount:1};}
    if(sql.includes('select s.id'))return {rows:retida && !(aguardaConfirmacao && sql.includes('not s.aguardando_confirmacao_medico'))?[{id:'sol-a',datas_consulta_texto:opcoes.datas===undefined?'07/10/2026':opcoes.datas,xdesc_serv:opcoes.legado??'LEGADO NAS DATAS 01/10/2026',datas_agendamentos:opcoes.datasAgenda??null}]:[]};
    if(sql.startsWith('update solicitacoes_nota')){assert.equal(p[1],'11111111-1111-4111-8111-111111111111');updates.push(p);retida=false;return {rows:[],rowCount:1};}
    return {rows:[],rowCount:0};
  }};
  const pool={connect:async()=>client,query:client.query} as any;
  const enviar={async enviarTexto(p:any){assert.equal(emTransacao,false,'HTTP deve ocorrer após a transação');envios.push(p);if(opcoes.falhar)throw Error('timeout');return {sucesso:true};}};
  const comunicador=opcoes.comunicador??{enviar:async(entrada:any)=>{
    const texto=({pedir_nome:'Qual seu nome completo?',pedir_crm:'Qual é o seu CRM?',dados_salvos:'Dados salvos.',pedir_confirmacao:'Autoriza? Responda pode emitir.',orientar_confirmacao:'Posso? Responda pode emitir.',retomada_autorizada:'Autorização salva.'}as any)[entrada.evento];
    try{const r=await enviar.enviarTexto({instanciaNome:'noto_oficial',contatoTelefone:medico.telefone,texto});return {sucesso:r.sucesso,envioIniciado:true};}
    catch{return {sucesso:false,envioIniciado:true};}
  }};
  return {service:new PostgresDadosProfissionaisService(pool,enviar,'noto_oficial',comunicador),envios,updates,queries,medico:()=>medico,pendencia:()=>pendencia,revisao:()=>revisao};
}
test('reserva pedido persistente antes do envio oficial e não repete após erro incerto', async()=>{
  const a=ambiente({falhar:true}); await a.service.solicitar('11111111-1111-4111-8111-111111111111');await a.service.solicitar('11111111-1111-4111-8111-111111111111');
  assert.equal(a.envios.length,1);assert.equal(a.envios[0].contatoTelefone,'5551999999999');assert.equal(a.envios[0].instanciaNome,'noto_oficial');assert.equal(a.pendencia()?.estado,'incerto');
});
test('perfil completo não pede dados nem mensagens fora de conversa pendente são gravadas',async()=>{
  const a=ambiente({nome:'Ana Silva',crm:'123/RS'});await a.service.solicitar('11111111-1111-4111-8111-111111111111');assert.equal(a.envios.length,0);
  assert.deepEqual(await a.service.processarResposta({medicoId:'11111111-1111-4111-8111-111111111111',mensagemId:'m1',texto:'Nome completo: Outra Pessoa\nCRM: 555/SP'}),{tratada:false,completo:true});assert.equal(a.medico().nome_completo,'Ana Silva');
});
test('resposta sequencial salva só campo ausente, deduplica e retoma com datas preservadas',async()=>{
  const a=ambiente({pendente:true});assert.deepEqual(await a.service.processarResposta({medicoId:'11111111-1111-4111-8111-111111111111',mensagemId:'m1',texto:'Ana Silva'}),{tratada:true,completo:false});
  assert.equal(a.medico().nome_completo,'Ana Silva');
  assert.deepEqual(await a.service.processarResposta({medicoId:'11111111-1111-4111-8111-111111111111',mensagemId:'m2',texto:'CRM: 12345/RS\nRQE: 123'}),{tratada:true,completo:true});
  assert.equal(a.medico().crm,'12345/RS');assert.equal(a.updates.length,1);assert.match(a.updates[0][2],/ANA SILVA VINCULADO CRM 12345\/RS \/ RQE 123 NAS DATAS 07\/10\/2026/);
  await a.service.processarResposta({medicoId:'11111111-1111-4111-8111-111111111111',mensagemId:'m2',texto:'CRM: 999/SP'});assert.equal(a.updates.length,1);
});
test('resposta arbitrária não altera perfil e falha do usuário reverte nome',async()=>{
  const a=ambiente({pendente:true});await a.service.processarResposta({medicoId:'11111111-1111-4111-8111-111111111111',mensagemId:'m1',texto:'emita para paciente CPF 123'});assert.equal(a.medico().nome_completo,'Médico 9886');
  const b=ambiente({pendente:true,falharUsuario:true});await assert.rejects(b.service.processarResposta({medicoId:'11111111-1111-4111-8111-111111111111',mensagemId:'m1',texto:'Ana Silva'}),/usuario falhou/);assert.equal(b.medico().nome_completo,'Médico 9886');
});

test('perfil incompleto após edição da Conta abre novo período sem duplicar prompt',async()=>{
  const a=ambiente({concluido:true,nome:'Ana Silva'});await a.service.solicitar('11111111-1111-4111-8111-111111111111');await a.service.solicitar('11111111-1111-4111-8111-111111111111');assert.equal(a.envios.length,1);
});

test('retomar pela Conta é idempotente e não altera solicitações sem retenção',async()=>{
 const a=ambiente({nome:'Ana Silva',crm:'123/RS'});assert.equal(await a.service.retomar('11111111-1111-4111-8111-111111111111'),1);assert.equal(await a.service.retomar('11111111-1111-4111-8111-111111111111'),0);assert.equal(a.updates.length,1);
 const b=ambiente({nome:'Ana Silva',crm:'123/RS',semSolicitacoes:true});assert.equal(await b.service.retomar('11111111-1111-4111-8111-111111111111'),0);assert.equal(b.updates.length,0);
});
test('datas legadas ou de agendamentos são preservadas na retomada',async()=>{
 for(const [opcoes,data] of [[{datas:null},'01/10/2026'],[{datas:null,legado:'legado sem data',datasAgenda:'02/10/2026, 03/10/2026'},'02/10/2026, 03/10/2026']] as const){
  const a=ambiente({...opcoes,nome:'Ana Silva',crm:'123/RS'});await a.service.retomar('11111111-1111-4111-8111-111111111111');assert.ok(a.updates[0][2].endsWith('NAS DATAS '+data));
 }
});
test('resposta parcial orienta CRM, inválida orienta campos faltantes e completa confirma sem alegar emissão',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const a=ambiente({pendente:true});await a.service.processarResposta({medicoId:id,mensagemId:'i1',texto:'emita a nota'});
 assert.equal(a.envios.length,1);assert.match(a.envios[0].texto,/nome completo/i);assert.doesNotMatch(a.envios[0].texto,/CRM/);
 await a.service.processarResposta({medicoId:id,mensagemId:'i1',texto:'emita a nota'});assert.equal(a.envios.length,1);
 await a.service.processarResposta({medicoId:id,mensagemId:'i2',texto:'Ana Silva'});assert.equal(a.envios.length,2);assert.match(a.envios[1].texto,/CRM/);
 await a.service.processarResposta({medicoId:id,mensagemId:'i3',texto:'12345/RS'});assert.equal(a.envios.length,3);assert.match(a.envios[2].texto,/salvos/i);assert.doesNotMatch(a.envios[2].texto,/nota emitida|notas emitidas/i);
 for(const envio of a.envios){assert.equal(envio.contatoTelefone,'5551999999999');assert.equal(envio.instanciaNome,'noto_oficial');}
 await a.service.processarResposta({medicoId:id,mensagemId:'i3',texto:'12345/RS'});assert.equal(a.envios.length,3);
});
test('falha na transação não envia mensagem de sucesso e conversa desconhecida não recebe resposta',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const a=ambiente({pendente:true,falharUsuario:true});await assert.rejects(a.service.processarResposta({medicoId:id,mensagemId:'i1',texto:'Ana Silva'}));assert.equal(a.envios.length,0);
 const b=ambiente();await b.service.processarResposta({medicoId:id,mensagemId:'i1',texto:'Ana Silva'});assert.equal(b.envios.length,0);
});


test('Conta libera notas antigas com perfil completo sem pedir confirmação', async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const a=ambiente({nome:'Ana Silva',crm:'123/RS',confirmacao:true});
 assert.equal(await a.service.retomar(id),1);
 assert.equal(await a.service.retomar(id),0);
 assert.equal(a.updates.length,1);
 assert.equal(a.envios.length,0);
});
test('completar dados no WhatsApp libera o lote antigo sem segunda autorização',async()=>{
 const id='11111111-1111-4111-8111-111111111111';
 const a=ambiente({pendente:true,confirmacao:true});
 await a.service.processarResposta({medicoId:id,mensagemId:'nome',texto:'Ana Silva'});
 assert.equal(a.updates.length,0);
 await a.service.processarResposta({medicoId:id,mensagemId:'crm',texto:'123/RS'});
 assert.equal(a.updates.length,1);
 assert.ok(a.envios.every(e=>!e.texto.includes('pode emitir')));
});
test('cadastro incompleto continua retido mesmo com autorização anterior',async()=>{
 const a=ambiente({confirmacao:true});
 assert.equal(await a.service.retomar('11111111-1111-4111-8111-111111111111'),0);
 assert.equal(a.updates.length,0);
});

test('falhas nos primeiros vinte avisos não impedem o próximo médico de ser atendido',async(t)=>{
 t.mock.method(console,'warn',()=>{});
 const ids=Array.from({length:21},(_,i)=>String(i+1).padStart(8,'0')+'-0000-4000-8000-000000000000');
 const pool={query:async(_sql:string,p:any[]=[])=>({rows:ids.filter(id=>!p[0]||id>p[0]).slice(0,20).map(medico_id=>({medico_id}))})} as any;
 const service=new PostgresDadosProfissionaisService(pool,{} as any,'noto_oficial');
 const notificados:string[]=[];
 service.solicitar=async id=>{if(id!==ids[20])throw Error('falha por cadastro');notificados.push(id);};
 service.retomar=async()=>0;
 await service.notificarPendentes();await service.notificarPendentes();
 assert.deepEqual(notificados,[ids[20]]);
});

test('comunicação de dado faltando delega o contexto para IA sem mensagem fixa',async()=>{
 const recebidas:any[]=[];
 const a=ambiente({comunicador:{enviar:async (entrada:any)=>{recebidas.push(entrada);return {sucesso:true,envioIniciado:true};}}});
 await a.service.solicitar('11111111-1111-4111-8111-111111111111');
 assert.equal(a.envios.length,0,'não chamar envio antigo com texto pronto');
 assert.equal(recebidas.length,1);assert.equal(recebidas[0].evento,'pedir_nome');assert.equal(recebidas[0].medicoId,'11111111-1111-4111-8111-111111111111');
});

 test('falha conhecida de geração libera nova investigação do pedido sem texto fixo',async()=>{
 let chamadas=0;const a=ambiente({comunicador:{enviar:async()=>{chamadas++;return {sucesso:false,envioIniciado:false};}}});
 await a.service.solicitar('11111111-1111-4111-8111-111111111111');assert.equal(a.pendencia(),null);
 await a.service.solicitar('11111111-1111-4111-8111-111111111111');assert.equal(chamadas,2);assert.equal(a.envios.length,0);
 });
test('falha na IA não impede retomada de cadastro já completo',async()=>{
 let chamadas=0;
 const a=ambiente({nome:'Ana Silva',crm:'123/RS',confirmacao:true,comunicador:{enviar:async()=>{chamadas++;return {sucesso:false,envioIniciado:false};}}});
 assert.equal(await a.service.retomar('11111111-1111-4111-8111-111111111111'),1);
 assert.equal(chamadas,0);
});
