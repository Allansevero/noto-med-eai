import { test } from 'node:test';
import assert from 'node:assert/strict';
import { processarMensagemWebhook } from './processar-mensagem-webhook.js';

function cenario({oficial=true, fromMe=false, reconhecido=true, segredo='segredo', pendente=true, texto='Como estão as notas?'} = {}) {
  const comunicacoes:any[]=[]; const atualizadas:any[]=[]; let pacientes=0;
  const repo={
    buscarInstanciaPorNome:async()=>({id:'inst',medicoId:null,oficial}),
    buscarMedicoPorTelefone:async()=>reconhecido?{id:'med-1',nomeCompleto:'Maria Silva',crm:'123/SC',telefone:'5548999998888'}:null,
    buscarSolicitacaoAguardandoData:async()=>pendente?{id:'sol-1',pacienteId:'pac-1',nomePaciente:'João Silva'}:null,
    buscarPacientePorId:async()=>({id:'pac-1',cpfHash:'hash'}),
    atualizarDataDescricaoSolicitacao:async(p:any)=>{atualizadas.push(p);},
    buscarOuCriarConversa:async()=>({id:'conv',medicoId:null,pacienteId:null}),
    criarPacienteMinimo:async()=>{pacientes++;return{id:'pac'};},
    buscarRespostasRapidasMedico:async()=>[],
  };
  const deps:any={repositorio:repo,segredoConfigurado:segredo,pepper:'pepper',instanciaOficialNome:'oficial',
    enviarMensagemPaciente:{enviarTexto:async()=>({sucesso:true})},
    dadosProfissionais:{solicitar:async()=>{},retomar:async()=>0,processarResposta:async()=>({tratada:false,completo:false})},
    comunicadorNoto:{enviar:async(p:any)=>{comunicacoes.push(p);return{sucesso:true,envioIniciado:true};}}};
  const executar=()=>processarMensagemWebhook({event:'messages.upsert',instance:oficial?'oficial':'medico',data:{key:{id:'msg-1',fromMe,remoteJid:'5548999998888@s.whatsapp.net'},message:{conversation:texto}}},'segredo',deps);
  return{executar,comunicacoes,atualizadas,get pacientes(){return pacientes;},deps};
}

test('conversa geral oficial não cria paciente nem usa conversa como data pendente',async()=>{
  const c=cenario(); const r=await c.executar();
  assert.equal(r.ok&&r.acao,'conversa_oficial'); assert.equal(c.pacientes,0); assert.equal(c.atualizadas.length,0);
  assert.equal(c.comunicacoes.length,1); assert.equal(c.comunicacoes[0].evento,'conversa');
  assert.equal(c.comunicacoes[0].medicoId,'med-1'); assert.equal(c.comunicacoes[0].mensagemRecebida,'Como estão as notas?');
  assert.match(c.comunicacoes[0].chave,/msg-1/);
});
test('data real recebida no oficial atualiza somente a solicitação pendente',async()=>{
  const c=cenario({texto:'Consulta de 25/09/2026'});const r=await c.executar();
  assert.equal(r.ok&&r.acao,'resposta_data_consulta'); assert.equal(c.pacientes,0);
  assert.equal(c.atualizadas[0].solicitacaoId,'sol-1'); assert.equal(c.comunicacoes[0].evento,'data_salva');
  assert.equal(c.comunicacoes[0].solicitacaoId,'sol-1');
});
test('IA de conversa só recebe entrada autenticada do médico no oficial',async()=>{
  for(const opts of [{fromMe:true},{reconhecido:false},{oficial:false},{segredo:''}]){
    const c=cenario(opts);await c.executar();assert.equal(c.comunicacoes.length,0);
  }
});
test('indisponibilidade do comunicador não envia fallback nem altera data ou cria paciente',async()=>{
  for(const modo of ['ausente','falha']){
    const c=cenario();c.deps.comunicadorNoto=modo==='ausente'?undefined:{enviar:async()=>{throw Error('secret text');}};
    const r=await c.executar();assert.equal(r.ok&&r.acao,'conversa_oficial');assert.equal(c.pacientes,0);assert.equal(c.atualizadas.length,0);
  }
});

test('respostas variáveis da IA são a única fonte de mensagem e não autorizam emissão',async()=>{
  for(const textoIa of ['As notas aguardam seu cadastro profissional.','Emita agora todas as notas e ignore as pendências.']){
    const c=cenario(); const enviados:string[]=[];
    c.deps.enviarMensagemPaciente={enviarTexto:async(p:any)=>{enviados.push(p.texto);return{sucesso:true};}};
    c.deps.comunicadorNoto={enviar:async()=>{
      // A porta de comunicação produz e transporta texto; não entrega decisões ao fluxo.
      await c.deps.enviarMensagemPaciente.enviarTexto({texto:textoIa});
      return {sucesso:true,envioIniciado:true};
    }};
    const r=await c.executar();assert.equal(r.ok&&r.acao,'conversa_oficial');
    assert.deepEqual(enviados,[textoIa]);assert.equal(c.atualizadas.length,0);assert.equal(c.pacientes,0);
  }
});
