import { Router, type RequestHandler } from 'express';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { controleLoginTribemd } from './tribemd-controle.js';
import { investigarTribemd, type DecisorTribemd, type EventoTribemd, type ResultadoTribemd } from './tribemd-agente.js';
import { ErroTribemd, type NavegadorColetaTribemd, type DiagnosticoLoginTribemd } from './tribemd-navegador.js';
interface Sessao { id:string;expira:number;estado:string;controller:AbortController;navegador?:NavegadorColetaTribemd;trabalho?:Promise<void>;timer?:NodeJS.Timeout;eventos:(EventoTribemd&{em:string})[];resultado?:ResultadoTribemd;diagnostico?:{codigo:string}&Partial<DiagnosticoLoginTribemd>;detalhe?:string;encerrando:boolean;modo:'automatico'|'assistido';entregar?:()=>void;controleOcupado?:boolean;tela?:Buffer;captura?:Promise<void> }
const dia=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;});
const entrada=z.union([z.object({modo:z.literal('automatico').optional(),email:z.string().trim().email().max(254),senha:z.string().min(1).max(256),inicio:dia,fim:dia}).strict(),z.object({modo:z.literal('assistido'),inicio:dia,fim:dia}).strict()]).refine(v=>v.fim>=v.inicio&&(Date.parse(v.fim)-Date.parse(v.inicio))/86400000<=31);
function apagarCorpo(req:any){if(Buffer.isBuffer(req.rawBody))req.rawBody.fill(0);delete req.rawBody;req.body={};}
function apagarCredenciais(d:z.infer<typeof entrada>){if('senha' in d){d.email='';d.senha='';}}
export function criarRouterTribemdDesenvolvedor(deps:{ativo:boolean;token?:string;configurado:boolean;decisor:DecisorTribemd;criarNavegador:(s:AbortSignal)=>Promise<NavegadorColetaTribemd>;registrar?:(e:Record<string,unknown>)=>void}){
 const router=Router(),sessoes=new Map<string,Sessao>();router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 if(!deps.ativo){router.use((_req,res)=>res.status(404).json({ok:false,detalhe:'Área de desenvolvedor desativada.'}));return router;}
 if(!deps.token||deps.token.trim()!==deps.token||deps.token.length<32||deps.token.length>256)throw Error('Chave de desenvolvedor inválida.');
 const hash=createHash('sha256').update(deps.token).digest();
 router.use((req,res,next)=>{const a=req.header('Authorization')||'',v=a.startsWith('Bearer ')?a.slice(7):'';if(!v||!timingSafeEqual(hash,createHash('sha256').update(v).digest())){res.status(401).json({ok:false,detalhe:'Informe a chave de desenvolvedor.'});return;}next();});
 const registrar=(s:Sessao,e:EventoTribemd)=>{
  const evento={...e,em:new Date().toISOString()};if(s.eventos.length<120)s.eventos.push(evento);
  // O diagnóstico detalhado fica na sessão autenticada, não no log operacional.
  (deps.registrar||((v)=>console.info('[TribemD desenvolvedor]',v)))({sessaoId:s.id,em:evento.em,etapa:e.etapa,ferramenta:e.ferramenta,codigo:e.codigo,pacientes:e.pacientes,agendamentos:e.agendamentos});
 };
 const capturar=async(s:Sessao)=>{
  if(s.encerrando)return;
  if(s.captura){await s.captura;return;}
  s.captura=(async()=>{try{const png=await s.navegador?.capturarTela?.();if(png&&!s.encerrando){s.tela?.fill(0);s.tela=png;}else png?.fill(0);}catch{}})();
  try{await s.captura;}finally{s.captura=undefined;}
 };
 const limpar=async(s:Sessao)=>{if(s.encerrando)return;s.encerrando=true;s.estado='encerrando';s.controller.abort();clearTimeout(s.timer);
  try{await s.navegador?.encerrar();await s.trabalho;}finally{s.eventos.length=0;s.resultado=undefined;s.tela?.fill(0);s.tela=undefined;sessoes.delete(s.id);}
 };
 const obter=(id:string)=>{const s=sessoes.get(id);if(!s||s.encerrando||s.expira<=Date.now())return null;return s;};
 const resposta=(s:Sessao)=>({ok:true,sessaoId:s.id,expiraEm:new Date(s.expira).toISOString(),estado:s.estado,modo:s.modo,eventos:s.eventos,resultado:s.resultado||null,diagnostico:s.diagnostico||null,detalhe:s.detalhe||null});
 const rota=(h:RequestHandler):RequestHandler=>async(req,res,next)=>{try{await h(req,res,next);}catch{if(!res.headersSent)res.status(500).json({ok:false,detalhe:'Não foi possível concluir a operação de teste.'});}};
 router.get('/acesso',(_req,res)=>res.json({ok:true,iaConfigurada:deps.configurado}));
 router.post('/sessoes',rota(async(req,res)=>{
  let d:z.infer<typeof entrada>;
  try{d=entrada.parse(req.body);}catch{res.status(400).json({ok:false,detalhe:'Informe o modo de login e datas válidas, com intervalo de até 31 dias. No modo automático, informe e-mail e senha.'});return;}
  finally{apagarCorpo(req);}
  if(!deps.configurado){apagarCredenciais(d);res.status(503).json({ok:false,detalhe:'Configure NVIDIA_API_KEY no serviço web para executar o agente.'});return;}
  if(sessoes.size){apagarCredenciais(d);res.status(429).json({ok:false,sessaoId:[...sessoes.keys()][0],detalhe:'Encerre a sessão anterior e aguarde a limpeza antes de iniciar outro teste.'});return;}
  const s:Sessao={id:randomUUID(),expira:Date.now()+20*60000,estado:'preparando',modo:d.modo||'automatico',controller:new AbortController(),eventos:[],encerrando:false};sessoes.set(s.id,s);
  s.timer=setTimeout(()=>{void limpar(s).catch(()=>{});},20*60000);s.timer.unref();
  res.status(202).json(resposta(s));
  s.trabalho=(async()=>{
   try{
    registrar(s,{etapa:'iniciando_navegador'});s.navegador=await deps.criarNavegador(s.controller.signal);s.controller.signal.throwIfAborted();
    if(d.modo==='assistido'){
     if(!s.navegador.abrirLoginAssistido)throw new ErroTribemd('LOGIN_ASSISTIDO_INDISPONIVEL','Implante a versão com login assistido.');
     await s.navegador.abrirLoginAssistido(s.controller.signal);s.controller.signal.throwIfAborted();
     s.estado='aguardando_login';s.detalhe='Faça o login na tela virtual, conclua a verificação e clique em Continuar com o Noto.';registrar(s,{etapa:'aguardando_login_humano'});
     await new Promise<void>(resolve=>{
      const fim=()=>{s.controller.signal.removeEventListener('abort',fim);s.entregar=undefined;resolve();};
      s.entregar=fim;s.controller.signal.addEventListener('abort',fim,{once:true});if(s.controller.signal.aborted)fim();
     });
    }else{
     s.estado='autenticando';registrar(s,{etapa:'autenticando'});
     try{await s.navegador.entrar(d.email,d.senha,s.controller.signal);}finally{apagarCredenciais(d);}
    }
    s.controller.signal.throwIfAborted();registrar(s,{etapa:'login_confirmado'});s.estado='investigando';
    s.resultado=await investigarTribemd(s.navegador,deps.decisor,d.inicio,d.fim,s.controller.signal,e=>registrar(s,e),r=>{s.resultado=r;});
    s.estado=s.resultado.pacientes.length||s.resultado.agendamentos.length?'parcial':'necessita_intervencao';
    if(s.estado==='necessita_intervencao'){s.diagnostico={codigo:'DADOS_NAO_RECONHECIDOS'};s.detalhe='O login foi confirmado, mas não reconhecemos dados cadastrais ou de agenda nas telas acessadas. Confira o diagnóstico da navegação para ajustar o adaptador.';}
    registrar(s,{etapa:'coleta_finalizada'});
   }catch(erro){if(!s.encerrando){s.estado='necessita_intervencao';s.diagnostico={...(erro instanceof ErroTribemd?erro.diagnostico:{}),codigo:erro instanceof ErroTribemd?erro.codigo:'FALHA_NAVEGACAO'};
     s.detalhe=erro instanceof ErroTribemd?erro.message:'A navegação foi interrompida. Consulte a última etapa registrada; o layout ou a conexão podem exigir ajuste.';
     registrar(s,{etapa:'intervencao_necessaria',codigo:s.diagnostico.codigo,diagnostico:s.diagnostico});}}
   finally{apagarCredenciais(d);await capturar(s);try{await s.navegador?.encerrar();}catch{registrar(s,{etapa:'limpeza_pendente',codigo:'FALHA_FECHAMENTO'});}}
  })();
 }));
 router.get('/sessoes/atual',(_req,res)=>{const s=[...sessoes.values()][0];
  res.json({ok:true,sessaoAtual:s?{sessaoId:s.id,estado:s.estado,expiraEm:new Date(s.expira).toISOString()}:null});
 });
 router.post('/sessoes/:id/controle',rota(async(req,res)=>{
  let c;try{c=controleLoginTribemd.parse(req.body);}catch{res.status(400).json({ok:false,detalhe:'Controle de login inválido.'});return;}finally{apagarCorpo(req);}
  const s=obter(String(req.params.id));if(!s){res.status(410).json({ok:false,detalhe:'Sessão encerrada ou expirada.'});return;}
  if(s.estado!=='aguardando_login'||s.controleOcupado||!s.navegador?.controlarLogin){res.status(409).json({ok:false,detalhe:'O controle está indisponível. Aguarde o login assistido ou a ação em andamento.'});return;}
  s.controleOcupado=true;
  try{await s.navegador.controlarLogin(c);registrar(s,{etapa:'controle_humano',ferramenta:c.tipo});res.json({ok:true});}
  catch(erro){res.status(409).json({ok:false,detalhe:erro instanceof ErroTribemd?erro.message:'Não foi possível executar esse controle de login.'});}
  finally{if(c.tipo==='digitar')c.texto='';s.controleOcupado=false;}
 }));
 router.post('/sessoes/:id/continuar',rota(async(req,res)=>{
  apagarCorpo(req);const s=obter(String(req.params.id));if(!s){res.status(410).json({ok:false,detalhe:'Sessão encerrada ou expirada.'});return;}
  if(s.estado!=='aguardando_login'||s.controleOcupado||!s.entregar||!s.navegador?.confirmarLoginAssistido){res.status(409).json({ok:false,detalhe:'A sessão não está aguardando a entrega do login.'});return;}
  s.controleOcupado=true;
  try{
   await s.navegador.confirmarLoginAssistido();s.controller.signal.throwIfAborted();
   s.estado='investigando';s.detalhe=undefined;s.entregar();res.status(202).json(resposta(s));
  }catch{res.status(409).json({ok:false,detalhe:'Conclua o login e a verificação na tela virtual antes de continuar.'});}
  finally{s.controleOcupado=false;}
 }));
 router.get('/sessoes/:id/tela',rota(async(req,res)=>{const s=obter(String(req.params.id));if(!s){res.status(410).json({ok:false,detalhe:'Sessão encerrada ou expirada.'});return;}
  await capturar(s);if(!obter(s.id)){res.status(410).json({ok:false,detalhe:'Sessão encerrada ou expirada.'});return;}
  res.json({ok:true,tipo:'image/png',imagemBase64:s.tela?.toString('base64')||null});
 }));
 router.get('/sessoes/:id',(req,res)=>{const s=obter(String(req.params.id));if(!s){res.status(410).json({ok:false,detalhe:'Sessão encerrada ou expirada.'});return;}res.json(resposta(s));});
 router.delete('/sessoes/:id',(req,res)=>{const s=sessoes.get(String(req.params.id));if(!s){res.status(410).json({ok:false,detalhe:'Sessão já encerrada.'});return;}
  void limpar(s).catch(()=>{});res.status(202).json({ok:true,detalhe:'Encerramento solicitado. O navegador e os dados da sessão serão removidos.'});
 });
 return router;
}
