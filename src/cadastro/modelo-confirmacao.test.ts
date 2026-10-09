import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { NvidiaGeradorMensagemNoto } from '../io/nvidia/adaptadores.js';
import { NvidiaDecisorCadastro } from './nvidia-decisor-cadastro.js';
const pendencia={id:'p',tipo:'responsavel' as const,candidatos:[{id:'ana',nome:'Ana de Souza'}],perguntaConfirmada:'Ana de Souza é a médica responsável?'};
test('modo confirmação recebe limite específico que suspende o roteiro antigo',async()=>{
 let prompt='';const f=mock.method(globalThis,'fetch',async(_url:unknown,opts:any)=>{prompt=JSON.parse(opts.body).messages[0].content;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({mensagens:['Ana de Souza é a médica responsável?']})}}]}));});
 try{
  await new NvidiaGeradorMensagemNoto('teste').gerar({evento:'conversa',destinatario:'medico',medico:{nome:null,crm:null,rqe:null},caso:null,quantidadeNotasParadas:0,mensagemRecebida:null,dados:{fluxo:'confirmacao_cadastro',pendencia},historico:[]});
  assert.match(prompt,/CONFIRMAÇÃO CADASTRAL/);assert.match(prompt,/Não inicie onboarding/);
 }finally{f.mock.restore();}
});
test('resposta natural inequívoca não precisa de chamada de IA para registrar candidato',async()=>{
 const f=mock.method(globalThis,'fetch',async()=>{throw Error('não chamar rede');});
 try{const d=await new NvidiaDecisorCadastro('teste').decidir(pendencia,'Sou eu');assert.equal(d.candidatoId,'ana');assert.equal(f.mock.callCount(),0);}finally{f.mock.restore();}
});
