import {test} from 'node:test';
import assert from 'node:assert/strict';
import {diagnosticoEntradaWebhook,diagnosticoResultadoWebhook,diagnosticoErroWebhook} from './diagnostico-webhook.js';

test('diagnóstico registra formato e motivo sem mensagens, credenciais ou telefones',()=>{
 const segredo='segredo-privado';
 const entrada=diagnosticoEntradaWebhook({event:'messages.upsert',instance:segredo,apikey:segredo,data:{key:{fromMe:true,remoteJid:'5511999991234@lid',id:segredo},message:{conversation:segredo}}});
 assert.deepEqual(entrada,{evento:'messages.upsert',fromMe:true,tipoContato:'lid',dadosEmLote:false});
 const resultado=diagnosticoResultadoWebhook({ok:true,acao:'comando_emissao',detalhe:{ok:false,motivo:'limite_atingido',detalhe:segredo}});
 assert.equal(resultado.motivo,'limite_atingido');
 assert.equal(resultado.resultado,'bloqueado');
 const erro=diagnosticoErroWebhook({code:'42703',message:segredo,query:segredo});
 assert.equal(erro.codigoBanco,'42703');
 assert.doesNotMatch(JSON.stringify([entrada,resultado,erro]),/segredo-privado|5511999991234/);
 assert.deepEqual(diagnosticoErroWebhook({code:segredo}),{codigo:'ERRO_PROCESSAMENTO'});
});
test('diagnóstico distingue descarte, erro de autenticação e fila aguardando dados',()=>{
 assert.equal(diagnosticoResultadoWebhook({ok:true,acao:'descartada',motivoDescarte:'contato_nao_identificado'}).motivo,'contato_nao_identificado');
 assert.equal(diagnosticoResultadoWebhook({ok:false,motivo:'autenticacao_invalida'}).resultado,'rejeitado');
 const r=diagnosticoResultadoWebhook({ok:true,acao:'comando_emissao',detalhe:{ok:true,fila:null,aguardandoCpf:false,aguardandoData:true,aguardandoDadosProfissionais:false}});
 assert.equal(r.fila,null);assert.equal(r.aguardandoData,true);
 assert.deepEqual(diagnosticoEntradaWebhook({event:'conteudo privado',data:{key:{remoteJid:'telefone privado'}}}),{evento:'outro',fromMe:undefined,tipoContato:'outro',dadosEmLote:false});
});

test('assistente registra estado real e confirmações sem tratar recebimento como envio',()=>{
 const r=diagnosticoResultadoWebhook({ok:true,acao:'conversa_assistente',detalhe:{estado:'pendente',mensagensConfirmadas:0,diagnostico:'segredo interno'}});
 assert.equal(r.estadoTurno,'pendente');assert.equal(r.mensagensConfirmadas,0);assert.doesNotMatch(JSON.stringify(r),/segredo interno/);
 assert.equal(diagnosticoResultadoWebhook({ok:true,acao:'descartada',motivoDescarte:'medico_nao_identificado'}).motivo,'medico_nao_identificado');
});
