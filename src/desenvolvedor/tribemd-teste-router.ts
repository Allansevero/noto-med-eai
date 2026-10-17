import express, { type Request, type Response, type RequestHandler } from 'express';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { NavegadorTribemd, ErroTribemd, type ResultadoLeituraTribemd } from './tribemd-navegador.js';
import { PerfisTribemd, type PerfilTribemd } from './tribemd-perfil.js';
const clinica=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const login=z.union([z.object({email:z.string().trim().email().max(254),senha:z.string().min(1).max(256)}).strict(),z.object({}).strict()]);
const controle=z.discriminatedUnion('tipo',[
 z.object({tipo:z.literal('clicar'),x:z.number().int().min(0).max(1279),y:z.number().int().min(0).max(899)}).strict(),
 z.object({tipo:z.literal('tecla'),tecla:z.enum(['Tab','Backspace','Escape'])}).strict(),
 z.object({tipo:z.literal('rolar'),deltaY:z.number().int().min(-900).max(900)}).strict(),
]);
export interface ConfigTesteTribemd { token:string;chave:string;diretorio:string;origem:string;chromium:string;xvfb?:string;proxy?:string }
interface Sessao {
 id:string;clinica:string;estado:string;codigo?:string;diagnostico?:unknown;resultado?:ResultadoLeituraTribemd;
 navegador?:NavegadorTribemd;controller:AbortController;trabalho?:Promise<void>;timer:NodeJS.Timeout;
 liberar:()=>Promise<void>;encerrando?:Promise<void>;loginTentado:boolean;credencialSalva:boolean;perfil:PerfilTribemd;expiraEm:string;
}
function apagarCorpo(req:Request){if(Buffer.isBuffer((req as any).rawBody))(req as any).rawBody.fill(0);delete (req as any).rawBody;req.body={};}
export function criarAreaTesteTribemd(config:ConfigTesteTribemd) {
 const origem=new URL(config.origem);
 if(origem.origin!==config.origem||!(origem.protocol==='https:'||origem.protocol==='http:'&&['127.0.0.1','localhost'].includes(origem.hostname)))throw Error('TRIBEMD_TESTE_ORIGEM deve ser uma origem HTTPS, ou loopback HTTP.');
 if(config.token.length<32||config.token.length>256)throw Error('TRIBEMD_TESTE_TOKEN deve ter 32–256 caracteres.');
 const app=express(),perfis=new PerfisTribemd(config.diretorio,config.chave),sessoes=new Map<string,Sessao>();
 const hash=createHash('sha256').update('teste:'+config.token).digest();let falhas=0,inicioJanela=Date.now(),reservado=false,parando=false;let criacaoPendente:Promise<void>|undefined,concluirCriacao:(()=>void)|undefined;
 app.disable('x-powered-by');app.set('trust proxy',1);
 app.use((req,res,next)=>{
  if(parando){res.status(503).json({ok:false,codigo:'AREA_ENCERRANDO'});return;}
  res.set({'Cache-Control':'no-store','Pragma':'no-cache','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY',
   'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
  if(req.headers.host!==origem.host||origem.protocol==='https:'&&!req.secure){res.status(403).json({ok:false,codigo:'ORIGEM_OU_TLS_INVALIDO'});return;}
  if(Date.now()-inicioJanela>60000){inicioJanela=Date.now();falhas=0;}
  const a=req.header('authorization')||'';
  let v='';try{if(a.startsWith('Basic '))v=Buffer.from(a.slice(6),'base64').toString();}catch{}
  const valido=timingSafeEqual(hash,createHash('sha256').update(v).digest());v='';
  if(!valido){falhas++;res.setHeader('WWW-Authenticate','Basic realm="Area de teste TribeMD", charset="UTF-8"');res.status(falhas>30?429:401).end();return;}
  if(!['GET','HEAD'].includes(req.method)&&(req.header('origin')!==origem.origin||req.header('x-tribemd-teste')!=='1')){res.status(403).json({ok:false,codigo:'ORIGEM_INVALIDA'});return;}
  next();
 });
 app.use(express.json({limit:'16kb'}));
 const resumo=(s:Sessao)=>({ok:true,id:s.id,estado:s.estado,autenticado:s.navegador?.estaAutenticado()??false,codigo:s.codigo,diagnostico:s.diagnostico,resultado:s.resultado,expiraEm:s.expiraEm,credencialSalva:s.credencialSalva});
 const falhar=(s:Sessao,e:unknown)=>{s.codigo=e instanceof ErroTribemd?e.codigo:'OPERACAO_FALHOU';s.diagnostico=e instanceof ErroTribemd?e.diagnostico:undefined;s.estado=s.estado==='lendo'&&s.navegador?.estaAutenticado()?'falha_leitura':'necessita_intervencao';};
 const persistir=async(s:Sessao)=>{const estado=await s.navegador?.perfil();if(estado){const perfil=await perfis.ler(s.clinica);try{perfil.estado=estado;await perfis.salvar(s.clinica,perfil);}finally{perfil.email='';perfil.senha='';}}};
 const encerrar=(s:Sessao)=>{
  if(!s.encerrando)s.encerrando=(async()=>{
   s.estado='encerrando';clearTimeout(s.timer);s.controller.abort();
   try{await s.navegador?.encerrar();await s.trabalho;}finally{try{await s.liberar();}finally{s.perfil={};s.resultado=undefined;s.diagnostico=undefined;sessoes.delete(s.id);}}
  })();return s.encerrando;
 };
 const rota=(h:RequestHandler):RequestHandler=>async(req,res,next)=>{try{await h(req,res,next);}catch(e){apagarCorpo(req);if(!res.headersSent)res.status(e instanceof z.ZodError?400:500).json({ok:false,codigo:e instanceof z.ZodError?'ENTRADA_INVALIDA':'OPERACAO_FALHOU'});}};
 const sessao=(req:Request,res:Response)=>{const s=sessoes.get(String(req.params.id));if(!s||s.encerrando){res.status(410).json({ok:false,codigo:'SESSAO_ENCERRADA'});return;}return s;};
 const trabalhar=(s:Sessao,acao:()=>Promise<void>)=>{s.trabalho=(async()=>{try{await acao();}catch(e){if(!s.encerrando)falhar(s,e);}finally{}})();};
 const ocupado=(s:Sessao)=>['abrindo','autenticando','lendo','confirmando'].includes(s.estado);
 app.get('/',(req,res)=>{
  if(req.baseUrl&&!req.originalUrl.split('?')[0].endsWith('/')){res.redirect(308,req.baseUrl+'/');return;}
  res.sendFile(fileURLToPath(new URL('../ui/tribemd-teste.html',import.meta.url)));
 });
 app.get('/teste.js',(_req,res)=>res.sendFile(fileURLToPath(new URL('../ui/tribemd-teste.js',import.meta.url))));
 app.get('/api/sessoes',(_req,res)=>res.json({ok:true,sessoes:[...sessoes.values()].map(resumo)}));
 app.post('/api/sessoes',rota(async(req,res)=>{
  let d;try{d=z.object({clinica}).strict().parse(req.body);}finally{apagarCorpo(req);}
  if(reservado||sessoes.size){res.status(409).json({ok:false,codigo:'NAVEGADOR_OCUPADO'});return;}reservado=true;criacaoPendente=new Promise<void>(resolve=>{concluirCriacao=resolve;});
  let liberar:(()=>Promise<void>)|undefined;
  try{
   liberar=await perfis.bloquear(d.clinica);if(parando)throw Error('AREA_ENCERRANDO');const perfil=await perfis.ler(d.clinica);if(parando){perfil.email='';perfil.senha='';throw Error('AREA_ENCERRANDO');}
   const s:Sessao={id:randomUUID(),clinica:d.clinica,estado:'abrindo',controller:new AbortController(),timer:undefined!,liberar,loginTentado:false,credencialSalva:!!perfil.senha,perfil:{estado:perfil.estado},expiraEm:new Date(Date.now()+20*60000).toISOString()};
   perfil.email='';perfil.senha='';
   s.timer=setTimeout(()=>{void encerrar(s).catch(()=>{});},20*60000);s.timer.unref();sessoes.set(s.id,s);
   trabalhar(s,async()=>{s.navegador=await NavegadorTribemd.criar({executavel:config.chromium,xvfb:config.xvfb,estado:s.perfil.estado,proxy:config.proxy},s.controller.signal);
    const estado=await s.navegador.abrir();if(s.controller.signal.aborted)return;
    s.estado=estado==='perfil_reutilizado'?'pronto':'aguardando_login';if(s.estado==='pronto')await persistir(s);
   });res.status(202).json(resumo(s));
  }catch(e){await liberar?.();res.status(409).json({ok:false,codigo:e instanceof Error&&['PERFIL_OCUPADO','PERFIL_INTEGRA_INVALIDA'].includes(e.message)?e.message:'PERFIL_INDISPONIVEL'});}
  finally{reservado=false;concluirCriacao?.();concluirCriacao=undefined;}
 }));
 app.post('/api/sessoes/:id/login',rota(async(req,res)=>{
  let d;try{d=login.parse(req.body);}finally{apagarCorpo(req);}
  const s=sessao(req,res);if(!s){if('senha'in d)d.senha='';return;}
  if(ocupado(s)||s.estado!=='aguardando_login'||s.loginTentado){if('senha'in d)d.senha='';res.status(409).json({ok:false,codigo:'LOGIN_INDISPONIVEL'});return;}
  s.loginTentado=true;s.estado='autenticando';
  // Persistir somente o envelope. Nenhuma chamada à IA ou logger nesta área.
  trabalhar(s,async()=>{
   const credencial='senha'in d?d:await perfis.ler(s.clinica);
   try{if(!credencial.email||!credencial.senha)throw new ErroTribemd('CREDENCIAL_AUSENTE');await perfis.salvar(s.clinica,{email:credencial.email,senha:credencial.senha});s.credencialSalva=true;
    await s.navegador!.entrar(credencial.email!,credencial.senha!);s.controller.signal.throwIfAborted();await persistir(s);s.estado='pronto';
   }finally{credencial.email='';credencial.senha='';if('senha'in d){d.email='';d.senha='';}}
  });res.status(202).json(resumo(s));
 }));
 app.post('/api/sessoes/:id/confirmar',rota(async(req,res)=>{
  apagarCorpo(req);const s=sessao(req,res);if(!s)return;
  if(ocupado(s)||s.navegador?.estaAutenticado()){res.status(409).json({ok:false,codigo:'CONTROLE_INDISPONIVEL'});return;}
  s.estado='confirmando';trabalhar(s,async()=>{await s.navegador!.confirmar();await persistir(s);s.codigo=undefined;s.diagnostico=undefined;s.estado='pronto';});res.status(202).json(resumo(s));
 }));
 app.post('/api/sessoes/:id/controle',rota(async(req,res)=>{
  let d;try{d=controle.parse(req.body);}finally{apagarCorpo(req);}
  const s=sessao(req,res);if(!s)return;
  if(ocupado(s)||s.navegador?.estaAutenticado()){res.status(409).json({ok:false,codigo:'CONTROLE_INDISPONIVEL'});return;}
  const anterior=s.estado;s.estado='confirmando';
  try{await s.navegador!.controle(d);res.json({ok:true});}catch{res.status(409).json({ok:false,codigo:'CONTROLE_INDISPONIVEL'});}finally{if(!s.encerrando)s.estado=anterior;}
 }));
 app.post('/api/sessoes/:id/ler',rota(async(req,res)=>{
  let d;try{d=z.object({pagina:z.enum(['agenda','pacientes']),detalhar:z.boolean().optional()}).strict().refine(d=>!d.detalhar||d.pagina==='agenda').parse(req.body);}finally{apagarCorpo(req);}
  const s=sessao(req,res);if(!s)return;if(!['pronto','falha_leitura'].includes(s.estado)||!s.navegador?.estaAutenticado()){res.status(409).json({ok:false,codigo:'LOGIN_OU_LEITURA_PENDENTE'});return;}
  s.codigo=undefined;s.diagnostico=undefined;s.resultado=undefined;s.estado='lendo';trabalhar(s,async()=>{s.resultado=await s.navegador!.ler(d.pagina,d.detalhar);await persistir(s);s.estado='pronto';});res.status(202).json(resumo(s));
 }));
 app.get('/api/sessoes/:id/tela',rota(async(req,res)=>{const s=sessao(req,res);if(!s)return;const png=await s.navegador?.tela();if(!png){res.status(204).end();return;}res.once('finish',()=>png.fill(0));res.once('close',()=>png.fill(0));res.type('png').send(png);}));
 app.get('/api/sessoes/:id',(req,res)=>{const s=sessao(req,res);if(s)res.json(resumo(s));});
 app.delete('/api/sessoes/:id',rota(async(req,res)=>{apagarCorpo(req);const s=sessao(req,res);if(!s)return;await encerrar(s);res.json({ok:true});}));
 app.delete('/api/perfis/:clinica',rota(async(req,res)=>{apagarCorpo(req);const id=clinica.parse(req.params.clinica);if(reservado||[...sessoes.values()].some(s=>s.clinica===id)){res.status(409).json({ok:false,codigo:'PERFIL_OCUPADO'});return;}const liberar=await perfis.bloquear(id);try{await perfis.esquecer(id);}finally{await liberar();}res.json({ok:true});}));
 app.use((_req,res)=>res.status(404).json({ok:false,codigo:'ROTA_INEXISTENTE'}));
 app.use((_erro:unknown,req:Request,res:Response,_next:unknown)=>{apagarCorpo(req);res.status(400).json({ok:false,codigo:'REQUISICAO_INVALIDA'});});
 return {app,encerrar:async()=>{parando=true;await criacaoPendente;await Promise.all([...sessoes.values()].map(encerrar));}};
}
