import { Router, type RequestHandler } from 'express';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { investigarTribemd, type DecisorTribemd, type EventoTribemd, type ResultadoTribemd } from './tribemd-agente.js';
import { ErroTribemd, type NavegadorColetaTribemd, type DiagnosticoLoginTribemd } from './tribemd-navegador.js';
interface Sessao { id:string;expira:number;estado:string;controller:AbortController;navegador?:NavegadorColetaTribemd;trabalho?:Promise<void>;timer?:NodeJS.Timeout;eventos:(EventoTribemd&{em:string})[];resultado?:ResultadoTribemd;diagnostico?:{codigo:string}&Partial<DiagnosticoLoginTribemd>;detalhe?:string;encerrando:boolean;tela?:Buffer;captura?:Promise<void> }
const dia=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;});
const entrada=z.object({email:z.string().trim().email().max(254),senha:z.string().min(1).max(256),inicio:dia,fim:dia}).strict().refine(v=>v.fim>=v.inicio&&(Date.parse(v.fim)-Date.parse(v.inicio))/86400000<=31);
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
 const resposta=(s:Sessao)=>({ok:true,sessaoId:s.id,expiraEm:new Date(s.expira).toISOString(),estado:s.estado,eventos:s.eventos,resultado:s.resultado||null,diagnostico:s.diagnostico||null,detalhe:s.detalhe||null});
 const rota=(h:RequestHandler):RequestHandler=>async(req,res,next)=>{try{await h(req,res,next);}catch{if(!res.headersSent)res.status(500).json({ok:false,detalhe:'Não foi possível concluir a operação de teste.'});}};
 router.get('/acesso',(_req,res)=>res.json({ok:true,iaConfigurada:deps.configurado}));
 router.post('/sessoes',rota(async(req,res)=>{
  let d:z.infer<typeof entrada>;
  try{d=entrada.parse(req.body);}catch{res.status(400).json({ok:false,detalhe:'Informe e-mail, senha e datas válidas, com intervalo de até 31 dias.'});return;}
  finally{const r=req as any;if(Buffer.isBuffer(r.rawBody))r.rawBody.fill(0);delete r.rawBody;req.body={};}
  if(!deps.configurado){d.senha='';res.status(503).json({ok:false,detalhe:'Configure GROQ_API_KEY no serviço web para executar o agente.'});return;}
  if(sessoes.size){d.senha='';res.status(429).json({ok:false,detalhe:'Encerre a sessão anterior e aguarde a limpeza antes de iniciar outro teste.'});return;}
  const s:Sessao={id:randomUUID(),expira:Date.now()+20*60000,estado:'preparando',controller:new AbortController(),eventos:[],encerrando:false};sessoes.set(s.id,s);
  s.timer=setTimeout(()=>{void limpar(s).catch(()=>{});},20*60000);s.timer.unref();
  res.status(202).json(resposta(s));
  s.trabalho=(async()=>{
   try{
    registrar(s,{etapa:'iniciando_navegador'});s.navegador=await deps.criarNavegador(s.controller.signal);s.controller.signal.throwIfAborted();
    s.estado='autenticando';registrar(s,{etapa:'autenticando'});
    try{await s.navegador.entrar(d.email,d.senha,s.controller.signal);}finally{d.email='';d.senha='';}
    s.controller.signal.throwIfAborted();registrar(s,{etapa:'login_confirmado'});s.estado='investigando';
    s.resultado=await investigarTribemd(s.navegador,deps.decisor,d.inicio,d.fim,s.controller.signal,e=>registrar(s,e),r=>{s.resultado=r;});
    s.estado=s.resultado.pacientes.length||s.resultado.agendamentos.length?'parcial':'necessita_intervencao';
    if(s.estado==='necessita_intervencao'){s.diagnostico={codigo:'DADOS_NAO_RECONHECIDOS'};s.detalhe='O login foi confirmado, mas não reconhecemos dados cadastrais ou de agenda nas telas acessadas. Confira o diagnóstico da navegação para ajustar o adaptador.';}
    registrar(s,{etapa:'coleta_finalizada'});
   }catch(erro){if(!s.encerrando){s.estado='necessita_intervencao';s.diagnostico={...(erro instanceof ErroTribemd?erro.diagnostico:{}),codigo:erro instanceof ErroTribemd?erro.codigo:'FALHA_NAVEGACAO'};
     s.detalhe=erro instanceof ErroTribemd?erro.message:'A navegação foi interrompida. Consulte a última etapa registrada; o layout ou a conexão podem exigir ajuste.';
     registrar(s,{etapa:'intervencao_necessaria',codigo:s.diagnostico.codigo,diagnostico:s.diagnostico});}}
   finally{d.email='';d.senha='';await capturar(s);try{await s.navegador?.encerrar();}catch{registrar(s,{etapa:'limpeza_pendente',codigo:'FALHA_FECHAMENTO'});}}
  })();
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
