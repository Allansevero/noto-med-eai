import type {ComunicadorNoto} from '../../conversa/comunicador-noto.js';
import {Router,type RequestHandler,type Response} from 'express';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import type pg from 'pg';
import type {GooglePlanilhas,MapeadorColunasPlanilha,ResultadoExtracaoPlanilha,ResultadoImportacaoPlanilha} from './types.js';
import {ErroNvidiaPlanilhas} from './nvidia-mapeador-colunas.js';
import {ErroGooglePlanilhas} from './google-client.js';
import {extrairPacientesPlanilha} from './extrair-pacientes.js';
import {importarPacientesPlanilha} from './importar-pacientes.js';
interface Deps {comunicador?:ComunicadorNoto;pool:pg.Pool;google?:GooglePlanilhas;mapeador?:MapeadorColunasPlanilha;autenticar:(token:string)=>Promise<string|null>;encryptionKey:string;pepper:string;redirectUri:string;googleApiKey?:string;googleAppId?:string;}
class ErroPublico extends Error{constructor(public readonly status:number,mensagem:string){super(mensagem);}}
class ErroCallbackGoogle extends Error{constructor(public readonly codigo:string){super(codigo);}}
function codigoBancoConhecido(erro:unknown):string|undefined {
 const codigo=(erro as {code?:unknown}|null)?.code;
 return typeof codigo==='string'&&['42P01','42703','42883','42501','42P08','42804','22P02','22023','23502','23503','23505','40001','40P01','53300','57014','08006','XX000'].includes(codigo)?codigo:undefined;
}
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const cookieNome='noto_google_estado';
export function identificarPlanilha(valor:unknown):string {
 if(typeof valor!=='string')throw new ErroPublico(400,'Informe o link da planilha.');
 let id=valor.trim();
 if(id.startsWith('https://')){const url=new URL(id);if(url.hostname!=='docs.google.com'||url.username||url.password||url.port)throw new ErroPublico(400,'Use um link do Google Planilhas.');id=url.pathname.match(/^\/spreadsheets\/d\/([\w-]+)(?:\/|$)/)?.[1]??'';}
 if(!/^[\w-]{10,200}$/.test(id))throw new ErroPublico(400,'O link da planilha não é válido.');return id;
}
export function criarRouterGooglePlanilhas(deps:Deps){
 const router=Router();const base='/api/integracoes/google-planilhas';
 router.use((_q,r,n)=>{r.setHeader('Cache-Control','no-store');n();});
 const proteger=(h:RequestHandler):RequestHandler=>async(q,r,n)=>{
  const inicio=Date.now();
  r.locals.planilhaEtapa='processar_requisicao';
  try{await h(q,r,n);}catch(e){
   const mensagem=e instanceof Error?e.message:'';
   const semCabecalho=mensagem==='Não foi possível identificar um cabeçalho confiável nas primeiras dez linhas.';
   const groq=mensagem.match(/^Não foi possível mapear colunas \(Groq HTTP (\d{3})\)\.$/);
   // Only known SQLSTATE identifiers; never log SQL, provider bodies, headers or error.message.
   const codigoBanco=codigoBancoConhecido(e);
   const status=e instanceof ErroPublico?e.status:semCabecalho?422:502;
   const rota=['/status','/conectar','/picker-token','/abas','/previa','/importar','/conexao'].includes(q.path)?q.path:'outra';
   const diagnostico={rota,etapa:r.locals.planilhaEtapa as string,
    codigo:semCabecalho?'CABECALHO_NAO_IDENTIFICADO':groq?'IA_HTTP_ERRO':codigoBanco?'BANCO_ERRO':'ERRO_INTERNO',
    ...(codigoBanco?{codigoBanco}:{}),...(groq?{statusHttp:Number(groq[1])}:{}),
    ...(e instanceof ErroGooglePlanilhas?{etapa:e.etapa,codigo:e.codigo,statusHttp:e.statusHttp}:{}),
    ...(e instanceof ErroNvidiaPlanilhas?{provedor:e.provedor,etapa:e.etapa,codigo:e.codigo,statusHttp:e.statusHttp}:{})};
   console.warn('[Google Planilhas]',{resultado:'falha',status,duracaoMs:Date.now()-inicio,...diagnostico});
   const detalhe=e instanceof ErroPublico||e instanceof ErroGooglePlanilhas||e instanceof ErroNvidiaPlanilhas?e.message:
    semCabecalho?'Não encontramos os títulos das colunas nesta aba. Use títulos como Nome, CPF, E-mail e Telefone nas primeiras dez linhas, ou escolha outra aba.':
    groq?'A leitura das colunas pela IA está indisponível. A equipe precisa verificar a configuração do serviço.':
    'Não foi possível concluir a operação. Confira a conexão e tente novamente.';
   r.status(status).json({ok:false,detalhe,diagnostico});
  }
 };
 const limparCookie=(r:any)=>r.clearCookie(cookieNome,{path:base+'/callback',httpOnly:true,sameSite:'lax',secure:deps.redirectUri.startsWith('https://')});
 // Callback público, ligado à sessão que iniciou OAuth por cookie+estado consumível.
 router.get('/callback',async(q,r)=>{
  let resultado='erro',etapa='validar_retorno';const inicio=Date.now();
  try{
   const estado=typeof q.query['state']==='string'?q.query['state']:'';
   const cookie=(q.header('Cookie')??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieNome+'='))?.slice(cookieNome.length+1)??'';
   if(!deps.google)throw new ErroCallbackGoogle('INTEGRACAO_INDISPONIVEL');
   if(!estado||estado.length>200)throw new ErroCallbackGoogle('ESTADO_INVALIDO');
   if(!cookie)throw new ErroCallbackGoogle('COOKIE_AUSENTE');
   if(!timingSafeEqual(Buffer.from(hash(estado)),Buffer.from(hash(cookie))))throw new ErroCallbackGoogle('ESTADO_INVALIDO');
   if(q.query['error'])throw new ErroCallbackGoogle(q.query['error']==='access_denied'?'AUTORIZACAO_RECUSADA':'AUTORIZACAO_FALHOU');
   const codigo=typeof q.query['code']==='string'?q.query['code']:'';if(!codigo||codigo.length>3000)throw new ErroCallbackGoogle('CODIGO_AUSENTE_OU_INVALIDO');
   etapa='consumir_estado';
   const o=(await deps.pool.query(`delete from google_planilhas_oauth where estado_hash=$1 and expira_em>now()
    returning medico_id,versao,pgp_sym_decrypt(verificador,$2) as verificador`,[hash(estado),deps.encryptionKey])).rows[0];
   if(!o)throw new ErroCallbackGoogle('ESTADO_EXPIRADO_OU_UTILIZADO');
   etapa='trocar_codigo';
   const tokens=await deps.google.trocarCodigo(codigo,o.verificador);
   etapa='validar_tokens';
   if(!tokens.refreshToken)throw new ErroCallbackGoogle('REFRESH_TOKEN_AUSENTE');
   etapa='salvar_tokens';
   const salvo=await deps.pool.query(`update google_planilhas_conexoes set access_token=pgp_sym_encrypt($3,$5),
    refresh_token=pgp_sym_encrypt($4,$5),expira_em=$6,atualizado_em=now() where medico_id=$1 and versao=$2 returning medico_id`,[o.medico_id,o.versao,tokens.accessToken,tokens.refreshToken,deps.encryptionKey,new Date(tokens.expiraEm)]);
   // Token de callback superado é descartado; revogar aqui poderia invalidar uma conexão mais recente do mesmo grant.
   if(!salvo.rows.length)throw new ErroCallbackGoogle('CONEXAO_SUPERADA');resultado='conectado';
   console.info('[Google Planilhas]',{rota:'/callback',etapa:'oauth',resultado:'concluido',duracaoMs:Date.now()-inicio});
  }catch(e){
   const codigoBanco=codigoBancoConhecido(e);
   console.warn('[Google Planilhas]',{rota:'/callback',etapa,resultado:'falha',duracaoMs:Date.now()-inicio,
    codigo:e instanceof ErroCallbackGoogle?e.codigo:codigoBanco?'BANCO_ERRO':'ERRO_INTERNO',
    ...(codigoBanco?{codigoBanco}:{}),
    ...(e instanceof ErroGooglePlanilhas?{etapa:e.etapa,codigo:e.codigo,statusHttp:e.statusHttp}:{})});
  }
  limparCookie(r);r.redirect('/?google_planilhas='+resultado);
 });
 router.use(proteger(async(q,r,n)=>{
  const h=q.header('Authorization')??'';const token=h.startsWith('Bearer ')?h.slice(7):'';
  r.locals.planilhaEtapa='autenticar_sessao';
  const user=token?await deps.autenticar(token):null;if(!user){r.status(401).json({ok:false,detalhe:'Entre novamente no Noto para conectar sua planilha.'});return;}
  r.locals.planilhaEtapa='resolver_medico';
  const m=(await deps.pool.query('select m.id from medicos m join usuarios u on u.id=m.usuario_id where u.auth_user_id=$1',[user])).rows[0];
  if(!m){r.status(403).json({ok:false,detalhe:'Conta médica não encontrada.'});return;}r.locals.medicoId=m.id;n();
 }));
 router.get('/status',proteger(async(_q,r)=>{
  if(!deps.google){r.json({ok:true,configurado:false,conectado:false});return;}
  r.locals.planilhaEtapa='consultar_conexao';
  const row=(await deps.pool.query('select access_token is not null as conectado from google_planilhas_conexoes where medico_id=$1',[r.locals.medicoId])).rows[0];
  r.json({ok:true,configurado:true,iaConfigurada:Boolean(deps.mapeador),conectado:Boolean(row?.conectado),pickerConfigurado:Boolean(deps.googleApiKey)});
 }));
 router.use((_q,r,n)=>{if(!deps.google){r.status(503).json({ok:false,detalhe:'A integração Google Planilhas ainda precisa ser configurada pela equipe.'});return;}n();});
 router.post('/conectar',proteger(async(_q,r)=>{
  const estado=randomBytes(32).toString('base64url'),verificador=randomBytes(48).toString('base64url');
  const client=await deps.pool.connect();
  try{
   await client.query('begin');
   const versao=(await client.query(`insert into google_planilhas_conexoes(medico_id,versao) values($1,1)
    on conflict(medico_id) do update set versao=google_planilhas_conexoes.versao+1,atualizado_em=now() returning versao`,[r.locals.medicoId])).rows[0]?.versao;
   if(!versao)throw Error('versao');
   await client.query('delete from google_planilhas_oauth where medico_id=$1 or expira_em<now()',[r.locals.medicoId]);
   await client.query(`insert into google_planilhas_oauth(estado_hash,medico_id,versao,verificador,expira_em)
    values($1,$2,$3,pgp_sym_encrypt($4,$5),now()+interval '10 minutes')`,[hash(estado),r.locals.medicoId,versao,verificador,deps.encryptionKey]);
   await client.query('commit');
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}
  r.cookie(cookieNome,estado,{httpOnly:true,sameSite:'lax',secure:deps.redirectUri.startsWith('https://'),path:base+'/callback',maxAge:600000});
  r.json({ok:true,url:deps.google!.urlAutorizacao(estado,createHash('sha256').update(verificador).digest('base64url'))});
 }));
 async function credencial(medicoId:string,r:Response){
  r.locals.planilhaEtapa='ler_credenciais';
  const c=(await deps.pool.query(`select versao,pgp_sym_decrypt(access_token,$2) as access_token,
   pgp_sym_decrypt(refresh_token,$2) as refresh_token,expira_em from google_planilhas_conexoes where medico_id=$1 and access_token is not null`,[medicoId,deps.encryptionKey])).rows[0];
  if(!c)throw new ErroPublico(409,'Conecte sua conta Google primeiro.');
  if(new Date(c.expira_em).getTime()<Date.now()+60000){
   if(!c.refresh_token)throw new ErroPublico(409,'Conecte sua conta Google novamente.');
   r.locals.planilhaEtapa='renovar_token';
   const novo=await deps.google!.renovar(c.refresh_token);
   r.locals.planilhaEtapa='salvar_token_renovado';
   const result=await deps.pool.query(`update google_planilhas_conexoes set access_token=pgp_sym_encrypt($3,$5),
    refresh_token=pgp_sym_encrypt($4,$5),expira_em=$6,atualizado_em=now() where medico_id=$1 and versao=$2 and access_token is not null returning medico_id`,[medicoId,c.versao,novo.accessToken,novo.refreshToken??c.refresh_token,deps.encryptionKey,new Date(novo.expiraEm)]);
   if(!result.rows.length)throw new ErroPublico(409,'A conexão foi encerrada. Conecte novamente.');c.access_token=novo.accessToken;
  }return c;
 }
 router.get('/picker-token',proteger(async(_q,r)=>{
  if(!deps.googleApiKey || !/^[1-9]\d*$/.test(deps.googleAppId??'')) throw new ErroPublico(503,'A equipe precisa configurar GOOGLE_API_KEY e GOOGLE_APP_ID com o número do projeto Google Cloud, não o nome do projeto.');
  const c=await credencial(r.locals.medicoId,r);
  r.json({ok:true,accessToken:c.access_token,apiKey:deps.googleApiKey??'',appId:deps.googleAppId??''});
 }));
 router.post('/abas',proteger(async(q,r)=>{const id=identificarPlanilha(q.body?.planilha);const c=await credencial(r.locals.medicoId,r);r.locals.planilhaEtapa='consultar_abas';const dados=await deps.google!.abas(c.access_token,id);r.json({ok:true,planilhaId:id,...dados});}));
 router.post('/previa',proteger(async(q,r)=>{
  if(!deps.mapeador)throw new ErroPublico(503,'A leitura por IA ainda precisa ser configurada pela equipe.');
  const id=identificarPlanilha(q.body?.planilha);const abaId=q.body?.abaId;if(!Number.isSafeInteger(abaId))throw new ErroPublico(400,'Escolha uma aba da planilha.');
  const med=r.locals.medicoId,c=await credencial(med,r);
  r.locals.planilhaEtapa='consultar_abas';
  const meta=await deps.google!.abas(c.access_token,id),aba=meta.abas.find(x=>x.id===abaId);
  if(!aba)throw new ErroPublico(400,'A aba escolhida não existe na planilha.');
  r.locals.planilhaEtapa='ler_celulas';
  const dados=await deps.google!.ler(c.access_token,id,aba.titulo);
  r.locals.planilhaEtapa='extrair_pacientes';
  const extracao=await extrairPacientesPlanilha(dados.valores,deps.mapeador,dados.limitado||aba.colunas>52||aba.linhas>1001);
  const previa={planilhaId:id,titulo:meta.titulo,aba:aba.titulo,...extracao};
  r.locals.planilhaEtapa='salvar_previa';
  const client=await deps.pool.connect();
  try{
   await client.query('begin');
   const atual=(await client.query('select versao,access_token is not null as conectado from google_planilhas_conexoes where medico_id=$1 for update',[med])).rows[0];
   if(!atual?.conectado||atual.versao!==c.versao)throw new ErroPublico(409,'A conexão mudou. Leia a planilha novamente.');
   await client.query(`delete from google_planilhas_previas where medico_id=$1 and (expira_em<now() or criado_em<now()-interval '24 hours')`,[med]);
   const p=(await client.query(`insert into google_planilhas_previas(medico_id,versao,dados) values($1,$2,pgp_sym_encrypt($3,$4)) returning id`,[med,c.versao,JSON.stringify(previa),deps.encryptionKey])).rows[0];
   if(!p)throw Error('previa');await client.query('commit');r.json({ok:true,previaId:p.id,...previa});
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}

 }));
 router.post('/importar',proteger(async(q,r)=>{
  const id=q.body?.previaId;if(typeof id!=='string'||!/^[-\da-f]{36}$/i.test(id))throw new ErroPublico(400,'Leia a planilha antes de importar.');
  const med=r.locals.medicoId,client=await deps.pool.connect();
  let dados:ResultadoExtracaoPlanilha;
  let resultado:ResultadoImportacaoPlanilha;
  try{
   await client.query('begin');
   const c=(await client.query('select versao,access_token is not null as conectado from google_planilhas_conexoes where medico_id=$1 for update',[med])).rows[0];
   await client.query('select id from medicos where id=$1 for update',[med]);
   const p=(await client.query(`select estado,resultado,versao,pgp_sym_decrypt(dados,$3) as dados from google_planilhas_previas
    where medico_id=$1 and id=$2 and expira_em>now() for update`,[med,id,deps.encryptionKey])).rows[0];
   if(!p||!c?.conectado||p.versao!==c.versao)throw new ErroPublico(409,'A prévia expirou ou a conexão mudou. Leia novamente.');
   dados=JSON.parse(p.dados) as ResultadoExtracaoPlanilha;
   if(p.estado==='importada') resultado=p.resultado as ResultadoImportacaoPlanilha;
   else {
    resultado=await importarPacientesPlanilha(client,med,dados.pacientes,deps.encryptionKey,deps.pepper);
    await client.query("update google_planilhas_previas set estado='importada',resultado=$3::jsonb where medico_id=$1 and id=$2",[med,id,JSON.stringify(resultado)]);
   }
   await client.query('commit');
   console.info('[Google Planilhas]', {etapa:'importar_pacientes', resultado:'concluido',
    criados:resultado.criados, completados:resultado.completados,
    semAlteracao:resultado.semAlteracao, ignorados:resultado.ignorados.length});
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}
  // O envio acontece depois do commit e de liberar a conexão. Uma falha no WhatsApp
  // não desfaz a importação. A chave persistida do comunicador evita envios duplicados.
  let orientacao:'enviada'|'indisponivel'|'nao_necessaria'='nao_necessaria';
  if(resultado.ignorados.length){
   orientacao='indisponivel';
   if(deps.comunicador)try{
    const exemplos:Record<string,unknown>={};
    for(const [indice,item] of resultado.ignorados.slice(0,5).entries()){
     const paciente=dados.pacientes.find(p=>p.linha===item.linha);
     exemplos['item'+indice]={linha:item.linha,nome:paciente?.nome??'Nome não identificado',motivo:item.motivo};
    }
    const envio=await deps.comunicador.enviar({medicoId:med,chave:'planilha:'+id+':orientacao',evento:'importacao_planilha',dados:{
     colunasReconhecidas:(dados.cabecalhosReconhecidos??Object.entries(dados.colunas).filter(([,v])=>v!==null).map(([k])=>k)).join(', '),
     encontrados:dados.pacientes.length,criados:resultado.criados,completados:resultado.completados,
     jaCadastrados:resultado.semAlteracao,naoImportados:resultado.ignorados.length,
     leituraLimitada:dados.limitado,exemplosParciais:resultado.ignorados.length>5,exemplos,
    }});
    if(envio.sucesso)orientacao='enviada';
   }catch{/* O resultado da importação permanece disponível mesmo sem comunicação. */}
   console.info('[Google Planilhas]',{etapa:'orientar_importacao',resultado:orientacao});
  }
  r.json({ok:true,...resultado,orientacao});
 }));
 router.delete('/conexao',proteger(async(_q,r)=>{
  const med=r.locals.medicoId;
  const client=await deps.pool.connect();let revogado=true;
  try{
   await client.query('begin');
   const old=(await client.query(`select pgp_sym_decrypt(refresh_token,$2) as token from google_planilhas_conexoes where medico_id=$1 for update`,[med,deps.encryptionKey])).rows[0];
   // Serializa apenas esta conexão durante revogação limitada pelo timeout do cliente Google.
   if(old?.token)try{await deps.google!.revogar(old.token);}catch{revogado=false;}
   await client.query(`update google_planilhas_conexoes set versao=versao+1,access_token=null,refresh_token=null,expira_em=null,atualizado_em=now() where medico_id=$1`,[med]);
   await client.query('delete from google_planilhas_oauth where medico_id=$1',[med]);await client.query('delete from google_planilhas_previas where medico_id=$1',[med]);
   await client.query('commit');r.json({ok:true,desconectado:true,revogadoNoGoogle:revogado});
  }catch(e){await client.query('rollback');throw e;}finally{client.release();}
 }));
 return router;
}
