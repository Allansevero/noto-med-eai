import type { Page, Request, Response } from 'playwright-core';

export interface ChamadaRedeLoginTribemd {
 ordem:number;
 servidor:string;
 rota:string;
 categoria:'autenticacao'|'outra';
 metodo:string;
 tipo:'document'|'xhr'|'fetch';
 fase:'pagina_login'|'envio_login';
 statusHttp?:number;
 falha?:'dns'|'tls'|'conexao'|'tempo_esgotado'|'cancelada'|'outro';
 sinais:string[];
}
export interface DiagnosticoRedeLoginTribemd {
 chamadas:ChamadaRedeLoginTribemd[];
 limiteChamadas:number;
 limitado:boolean;
}
const segmentosPublicos=new Set(['api','auth','login','oauth','oauth2','token','session','sessions','signin','sign-in','authenticate','authentication','access','account','sso','v1','v2','v3','status']);

// Observação passiva: não lê corpo, cookies ou cabeçalhos de requisição.
export class ObservadorRedeLoginTribemd {
 private chamadas:ChamadaRedeLoginTribemd[]=[];
 private registros=new WeakMap<Request,ChamadaRedeLoginTribemd>();
 private pendentes=new Set<Promise<void>>();
 private fase:ChamadaRedeLoginTribemd['fase']='pagina_login';
 private ordem=0;
 private limitado=false;
 private conclusao?:Promise<DiagnosticoRedeLoginTribemd>;
 constructor(private page:Page){
  page.on('request',this.requisicao);
  page.on('response',this.resposta);
  page.on('requestfailed',this.falha);
 }
 marcarEnvioLogin(){this.fase='envio_login';}
 private requisicao=(request:Request)=>{
  const tipo=request.resourceType();if(tipo!=='document'&&tipo!=='xhr'&&tipo!=='fetch')return;
  let url:URL;try{url=new URL(request.url());}catch{return;}
  if(url.protocol!=='https:'&&url.protocol!=='http:')return;
  const metodo=request.method();
  const chamada:ChamadaRedeLoginTribemd={
   ordem:++this.ordem,servidor:url.hostname,
   rota:'/'+url.pathname.split('/').filter(Boolean).slice(0,12).map(s=>segmentosPublicos.has(s.toLowerCase())?s.toLowerCase():'[segmento]').join('/'),
   categoria:/(?:^|\/)(?:auth|login|oauth2?|token|sessions?|signin|sign-in|authenticate|authentication|sso)(?:\/|$)/i.test(url.pathname)?'autenticacao':'outra',
   metodo:['GET','POST','OPTIONS','PUT','PATCH','DELETE','HEAD'].includes(metodo)?metodo:'OUTRO',
   tipo,fase:this.fase,sinais:[],
  };
  if(this.chamadas.length>=40){
   this.limitado=true;
   const indice=this.chamadas.findIndex(c=>!c.falha&&!(c.statusHttp&&c.statusHttp>=400));
   this.chamadas.splice(indice<0?0:indice,1);
  }
  this.chamadas.push(chamada);this.registros.set(request,chamada);
 };
 private resposta=(response:Response)=>{
  const chamada=this.registros.get(response.request());if(!chamada)return;
  chamada.statusHttp=response.status();
  // Somente valores reconhecidos viram sinais fixos. Cabeçalhos nunca são publicados.
  const tarefa=Promise.all(['server','cf-mitigated','x-amzn-waf-action'].map(nome=>response.headerValue(nome)))
   .then(([servidor,cloudflare,aws])=>{
    const infra=(servidor||'').toLowerCase();
    if(infra.includes('cloudflare'))chamada.sinais.push('infra_cloudflare');
    else if(infra.includes('cloudfront'))chamada.sinais.push('infra_cloudfront');
    else if(infra.includes('akamai'))chamada.sinais.push('infra_akamai');
    if(cloudflare?.toLowerCase()==='challenge')chamada.sinais.push('desafio_cloudflare');
    if(aws?.toLowerCase()==='challenge')chamada.sinais.push('desafio_aws_waf');
    if(aws?.toLowerCase()==='captcha')chamada.sinais.push('captcha_aws_waf');
   }).catch(()=>{});
  this.pendentes.add(tarefa);void tarefa.finally(()=>this.pendentes.delete(tarefa));
 };
 private falha=(request:Request)=>{
  const chamada=this.registros.get(request);if(!chamada)return;
  const erro=request.failure()?.errorText||'';
  chamada.falha=/NAME_NOT_RESOLVED/.test(erro)?'dns':/CERT_|SSL_/.test(erro)?'tls':/TIMED_OUT/.test(erro)?'tempo_esgotado':/ABORTED/.test(erro)?'cancelada':/net::ERR_/.test(erro)?'conexao':'outro';
 };
 concluir():Promise<DiagnosticoRedeLoginTribemd>{
  if(!this.conclusao){
   this.page.off('request',this.requisicao);this.page.off('response',this.resposta);this.page.off('requestfailed',this.falha);
   this.conclusao=Promise.all([...this.pendentes]).then(()=>({chamadas:structuredClone(this.chamadas),limiteChamadas:40,limitado:this.limitado}));
  }
  return this.conclusao;
 }
}
