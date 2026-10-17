import type { ConfigTesteTribemd } from './tribemd-teste-router.js';
export interface PendenciaTesteTribemd { variavel:string; motivo:string }
export type ConfiguracaoTesteTribemd = {ok:true;config:ConfigTesteTribemd}|{ok:false;pendencias:PendenciaTesteTribemd[]};

/** Retorna somente regras fixas nas pendências; nunca refletir valores do ambiente. */
export function validarConfiguracaoTesteTribemd(env:NodeJS.ProcessEnv):ConfiguracaoTesteTribemd {
 const pendencias:PendenciaTesteTribemd[]=[];
 const obrigatoria=(variavel:string)=>{
  const v=env[variavel];
  if(!v?.trim()){pendencias.push({variavel,motivo:'Variável ausente ou vazia.'});return '';}
  return v;
 };
 const token=obrigatoria('TRIBEMD_TESTE_TOKEN'),chave=obrigatoria('TRIBEMD_TESTE_CHAVE');
 const diretorio=obrigatoria('TRIBEMD_TESTE_DIRETORIO').trim(),origemInformada=obrigatoria('TRIBEMD_TESTE_ORIGEM').trim();
 if(token&&(token.length<32||token.length>256))pendencias.push({variavel:'TRIBEMD_TESTE_TOKEN',motivo:'Use de 32 a 256 caracteres.'});
 if(chave){
  const bytes=Buffer.from(chave,'base64');
  if(bytes.length!==32||bytes.toString('base64')!==chave)pendencias.push({variavel:'TRIBEMD_TESTE_CHAVE',motivo:'Use exatamente 32 bytes codificados em base64 (44 caracteres, terminando em =), sem aspas ou espaços.'});
  bytes.fill(0);
 }
 let origem='';
 if(origemInformada){
  try{
   const u=new URL(origemInformada);
   if((u.protocol!=='https:'&&!(u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))||u.pathname!=='/'||u.search||u.hash||u.username||u.password)throw Error();
   // Barra final, caixa do hostname e porta HTTPS padrão não mudam a origem.
   origem=u.origin;
  }catch{pendencias.push({variavel:'TRIBEMD_TESTE_ORIGEM',motivo:'Informe somente a origem HTTPS do Noto, por exemplo https://seu-dominio.com, sem caminho, parâmetros ou credenciais. A barra final é aceita. HTTP apenas em loopback.'});}
 }
 if(pendencias.length)return {ok:false,pendencias};
 return {ok:true,config:{token,chave,diretorio,origem,chromium:env.CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium-browser',xvfb:env.XVFB_EXECUTABLE_PATH}};
}
