import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {criarRouterGooglePlanilhas} from './router.js';
import {ErroGooglePlanilhas} from './google-client.js';

interface Cenario {nome:string;cookie?:false|string;erroGoogle?:string;expirado?:boolean;falhaTroca?:boolean;semRefresh?:boolean;superada?:boolean;falhaBanco?:boolean;etapa:string;codigo:string;consultas:number;trocas:number;}
const casos:Cenario[] = [
 {nome:'cookie ausente',cookie:false,etapa:'validar_retorno',codigo:'COOKIE_AUSENTE',consultas:0,trocas:0},
 {nome:'estado divergente',cookie:'outro-estado-secreto',etapa:'validar_retorno',codigo:'ESTADO_INVALIDO',consultas:0,trocas:0},
 {nome:'autorização recusada',erroGoogle:'access_denied',etapa:'validar_retorno',codigo:'AUTORIZACAO_RECUSADA',consultas:0,trocas:0},
 {nome:'estado expirado',expirado:true,etapa:'consumir_estado',codigo:'ESTADO_EXPIRADO_OU_UTILIZADO',consultas:1,trocas:0},
 {nome:'troca do código recusada',falhaTroca:true,etapa:'trocar_codigo',codigo:'RECONECTAR',consultas:1,trocas:1},
 {nome:'refresh token ausente',semRefresh:true,etapa:'validar_tokens',codigo:'REFRESH_TOKEN_AUSENTE',consultas:1,trocas:1},
 {nome:'conexão superada',superada:true,etapa:'salvar_tokens',codigo:'CONEXAO_SUPERADA',consultas:2,trocas:1},
 {nome:'falha ao salvar tokens',falhaBanco:true,etapa:'salvar_tokens',codigo:'BANCO_ERRO',consultas:2,trocas:1},
];

for(const caso of casos) test(`callback identifica ${caso.nome} sem expor credenciais`,async()=>{
 const logs:unknown[][]=[];const warn=console.warn;console.warn=(...args)=>{logs.push(args);};
 let consultas=0,trocas=0;
 const pool={query:async(sql:string)=>{
  consultas++;
  if(sql.startsWith('delete from google_planilhas_oauth'))return {rows:caso.expirado?[]:[{medico_id:'medico-teste',versao:1,verificador:'verificador-secreto'}]};
  if(sql.startsWith('update google_planilhas_conexoes')){
   if(caso.falhaBanco)throw Object.assign(Error('sql e conteúdo privado'),{code:'42501'});
   return {rows:caso.superada?[]:[{medico_id:'medico-teste'}]};
  }
  throw Error('SQL inesperado');
 }} as any;
 const google={trocarCodigo:async()=>{
  trocas++;
  if(caso.falhaTroca)throw new ErroGooglePlanilhas('trocar_codigo','RECONECTAR',400,'corpo secreto do provedor');
  return {accessToken:'token-secreto',...(caso.semRefresh?{}:{refreshToken:'refresh-secreto'}),expiraEm:Date.now()+3600000};
 }} as any;
 const app=express();app.use('/planilhas',criarRouterGooglePlanilhas({pool,google,autenticar:async()=>null,encryptionKey:'chave-secreta',pepper:'pepper-secreto',redirectUri:'https://noto.example/api/integracoes/google-planilhas/callback'}));
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{
  const url=new URL(`http://127.0.0.1:${(server.address() as any).port}/planilhas/callback`);
  url.searchParams.set('state','estado-secreto');url.searchParams.set('code','codigo-secreto');
  if(caso.erroGoogle)url.searchParams.set('error',caso.erroGoogle);
  const response=await fetch(url,{redirect:'manual',headers:caso.cookie===false?{}:{Cookie:`noto_google_estado=${caso.cookie??'estado-secreto'}`}});
  assert.equal(response.status,302);assert.equal(response.headers.get('location'),'/?google_planilhas=erro');
  assert.equal(consultas,caso.consultas);assert.equal(trocas,caso.trocas);
  const log=logs.find(x=>x[0]==='[Google Planilhas]')?.[1] as Record<string,unknown>;
  assert.equal(log?.codigo,caso.codigo);assert.equal(log.etapa,caso.etapa);assert.equal(log.resultado,'falha');
  assert.ok(typeof log.duracaoMs==='number');
  if(caso.falhaTroca)assert.equal(log.statusHttp,400);
  if(caso.falhaBanco)assert.equal(log.codigoBanco,'42501');
  assert.doesNotMatch(JSON.stringify(logs),/secreto|privado|sql e conteúdo/);
 }finally{console.warn=warn;await new Promise<void>(r=>server.close(()=>r()));}
});
