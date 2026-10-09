import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfirmadorCadastro } from './confirmador-cadastro.js';
const pendencia={id:'p',tipo:'responsavel' as const,candidatos:[{id:'ana',nome:'Ana de Souza'}],perguntaConfirmada:'Ana de Souza é a médica responsável?'};
function fixture(){
 const trabalho={dados:{pendencia},snapshot:{nome:'Médico X',crm:null},medico_id:'m'};
 let avisoReservado=false,respostaReservada=false;const eventos:string[]=[];
 const aviso={id:'aviso',trabalho_id:'t',tipo:'pergunta',texto:null,trabalho,telefone:'5551999999999'};
 const resposta={id:'r',texto:'Sou eu',trabalho};
 const repo={enfileirarResposta:async()=>true,reservarResposta:async()=>respostaReservada?null:(respostaReservada=true,resposta),aplicarConfirmacao:async(_r:any,patch:any)=>{assert.deepEqual(patch,{nome:'Ana de Souza'});eventos.push('salvo');},falharResposta:async()=>{eventos.push('falha resposta');},
  reservarAviso:async()=>avisoReservado?null:(avisoReservado=true,aviso),prepararAviso:async(_a:any,texto:string)=>{aviso.texto=texto as any;eventos.push('preparado');},iniciarAviso:async()=>{eventos.push('inicio envio');return true;},confirmarAviso:async()=>{eventos.push('confirmado');},falharAviso:async()=>{eventos.push('falha aviso');}};
 return {repo,aviso,eventos};
}
test('confirmação aplica dado antes de redigir e enviar; leitura usa chave real',async()=>{
 const f=fixture();let fluxo='';
 const c=new ConfirmadorCadastro(f.repo as any,{decidir:async()=>({acao:'confirmar_candidato',candidatoId:'ana',evidencia:'Sou eu'})},{gerar:async(ctx)=>{fluxo=String(ctx.dados.fluxo);return ['Ana de Souza é a médica responsável?'];}},{enviarTexto:async()=>{f.eventos.push('enviado');return {sucesso:true};}},'assistente',async()=>{f.eventos.push('avancar');},{marcarLida:async(p)=>{assert.equal(p.chaveMensagem?.remoteJid,'999@lid');return {sucesso:true};}});
 await c.receber({medicoId:'m',instancia:'assistente',mensagemId:'r',texto:'Sou eu',contatoTelefone:'5551999999999',chaveMensagem:{id:'r',remoteJid:'999@lid',fromMe:false}});
 await c.recuperar();
 assert.equal(fluxo,'confirmacao_cadastro');assert.deepEqual(f.eventos,['salvo','avancar','preparado','inicio envio','enviado','confirmado']);
});
test('texto que tenta reiniciar onboarding é recusado antes de enviar',async()=>{
 const f=fixture();let enviados=0;
 const c=new ConfirmadorCadastro(f.repo as any,{decidir:async()=>({acao:'confirmar_candidato',candidatoId:'ana',evidencia:'Sou eu'})},{gerar:async()=>['Há quanto tempo está sem emitir notas?']},{enviarTexto:async()=>{enviados++;return {sucesso:true};}},'assistente');
 await c.recuperar();assert.equal(enviados,0);assert.ok(f.eventos.includes('falha aviso'));
});
test('assistente desconectado preserva aviso para enviar após conexão, sem entrar em incerto',async()=>{
 const f=fixture();f.repo.reservarResposta=async()=>null as any;let conectado=false,enviados=0;
 const c=new ConfirmadorCadastro(f.repo as any,{decidir:async()=>({acao:'esclarecer'})},{gerar:async()=>['Ana de Souza é a médica responsável?']},{enviarTexto:async()=>{enviados++;return {sucesso:true};}},'assistente',undefined,undefined,async()=>conectado);
 await c.recuperar();assert.equal(enviados,0);assert.equal(f.eventos.includes('inicio envio'),false);assert.equal(f.eventos.includes('preparado'),false);
 conectado=true;await c.recuperar();assert.equal(enviados,1);assert.equal(f.eventos.includes('falha aviso'),false);
});
