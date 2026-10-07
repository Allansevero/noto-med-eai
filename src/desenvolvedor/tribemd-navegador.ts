import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { TelaVirtualTribemd } from './tribemd-display.js';
import { ObservadorRedeLoginTribemd, type DiagnosticoRedeLoginTribemd } from './tribemd-rede.js';
import { createHash } from 'node:crypto';
import { campoTribemd, type TelaTribemd } from './tribemd-dados.js';
const origem='https://app.tribemd.com';
export interface DiagnosticoLoginTribemd {
 etapa:string;pagina?:'login'|'inicio'|'outra';statusHttp?:number;
 campos?:{senha:number;email:number;texto:number;outros:number};botoesLogin?:number;desafio?:boolean;
 tipoFalha?:'tempo_esgotado'|'dns'|'tls'|'conexao'|'outro';
 rede?:DiagnosticoRedeLoginTribemd;
}
export class ErroTribemd extends Error { constructor(public codigo:string,message:string,public diagnostico?:DiagnosticoLoginTribemd){super(message);} }
export interface OpcaoTribemd { id:string;acao:'abrir_pacientes'|'abrir_agenda'|'ler_cadastro'|'proxima_pagina' }
export interface VisaoTribemd { ferramentaId:string;imagemBase64:string }
export interface LeituraTribemd { visao?:VisaoTribemd[]; tela:TelaTribemd;opcoes:OpcaoTribemd[];diagnostico:{caminho:string;tabelas:number;linhas:number;campos:string[];limitada:boolean} }
export interface NavegadorColetaTribemd { entrar(email:string,senha:string,signal:AbortSignal):Promise<void>;ler():Promise<LeituraTribemd>;executar(id:string):Promise<void>;encerrar():Promise<void>;capturarTela?():Promise<Buffer|null> }
export class NavegadorTribemd implements NavegadorColetaTribemd {
 private page?:Page;private autenticado=false;private fechado=false;private fechamento?:Promise<void>;
 private acoes=new Map<string,{opcao:OpcaoTribemd;url:string;botao?:string}>();private visitadas=new Set<string>();
 constructor(private context:BrowserContext,private fechar:()=>Promise<void>=()=>context.close()){}
 static async criar(executavel:string,signal:AbortSignal):Promise<NavegadorTribemd>{
  signal.throwIfAborted();let display:TelaVirtualTribemd;
  try{display=await TelaVirtualTribemd.iniciar(signal);}
  catch{throw new ErroTribemd('TELA_VIRTUAL_INDISPONIVEL','A tela virtual não iniciou. Implante a imagem com Xvfb antes de repetir o teste.');}
  let browser;
  try{browser=await chromium.launch({executablePath:executavel,headless:false,env:{...process.env,DISPLAY:display.display},args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'],timeout:20000});}
  catch{await display.encerrar();throw new ErroTribemd('NAVEGADOR_INDISPONIVEL','O Chromium não pôde iniciar na tela virtual. Confira a imagem e o caminho do navegador.');}
  if(signal.aborted){await browser.close();await display.encerrar();signal.throwIfAborted();}
  try{const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:false,serviceWorkers:'block'});
   return new NavegadorTribemd(context,async()=>{try{await browser.close();}finally{await display.encerrar();}});
  }catch(erro){await browser.close();await display.encerrar();throw erro;}
 }
 async capturarTela():Promise<Buffer|null>{
  if(!this.page||this.page.isClosed()||this.fechado)return null;
  // A tela completa fica só na sessão autenticada. Campos de entrada nunca aparecem.
  try{return await this.page.screenshot({type:'png',timeout:3000,mask:[this.page.locator('input,textarea,[contenteditable=true]')]});}catch{return null;}
 }
 private async observarControles():Promise<VisaoTribemd[]>{
  const page=this.obterPagina(),visao:VisaoTribemd[]=[];
  for(const a of this.acoes.values()){
   if(!['abrir_pacientes','abrir_agenda'].includes(a.opcao.acao))continue;
   const nome=a.opcao.acao==='abrir_pacientes'?/^(pacientes|meus pacientes|clientes)$/i:/^(agenda|agendamentos)$/i;
   const controles=page.locator('a,nav button,aside button,[role=navigation] button,[role=tab]').filter({hasText:nome});
   for(let i=0;i<await controles.count();i++){
    const controle=controles.nth(i);if(!await controle.isVisible())continue;
    const destino=await controle.getAttribute('href');
    if(!a.botao&&(!destino||new URL(destino,page.url()).href!==a.url))continue;
    if(a.botao&&destino)continue;
    const caixa=await controle.boundingBox();if(!caixa||caixa.width>700||caixa.height>160)continue;
    try{const png=await controle.screenshot({type:'png',timeout:2000});visao.push({ferramentaId:a.opcao.id,imagemBase64:png.toString('base64')});}catch{}
    break;
   }
   if(visao.length>=2)break;
  }
  return visao;
 }
 async entrar(email:string,senha:string,signal:AbortSignal){
  signal.throwIfAborted();if(this.fechado)throw new ErroTribemd('SESSAO_ENCERRADA','Sessão encerrada.');
  this.page=await this.context.newPage();this.page.setDefaultTimeout(12000);
  this.context.on('page',p=>{if(p!==this.page)void p.close().catch(()=>{});});
  await this.page.route('**/*',async route=>{
   const req=route.request();if(req.isNavigationRequest()&&req.frame()===this.page!.mainFrame()&&new URL(req.url()).origin!==origem){await route.abort();return;}
   await route.fallback();
  });
  const abort=()=>{void this.encerrar().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  const rede=new ObservadorRedeLoginTribemd(this.page);
  let etapa='abrindo_login',statusHttp:number|undefined;
  try{
   const resposta=await this.page.goto(origem+'/login?continue=/inicio',{waitUntil:'domcontentloaded',timeout:25000});statusHttp=resposta?.status();
   if(statusHttp&&statusHttp>=400)throw new ErroTribemd('LOGIN_HTTP_ERRO','O TribemD retornou uma resposta de erro ao abrir o login. Confira o status HTTP no diagnóstico.');
   etapa='aguardando_formulario';
   const senhaInput=this.page.locator('input[type=password]:visible');
   const emailInput=this.page.locator('input[type=email]:visible, input[autocomplete=username]:visible, input[name=email]:visible, input[name=username]:visible, input[id*=email i]:visible, input[placeholder*=email i]:visible, input[placeholder*="e-mail" i]:visible');
   await senhaInput.first().waitFor({state:'visible'});
   if(await senhaInput.count()!==1||await emailInput.count()!==1)throw new ErroTribemd('LOGIN_LAYOUT_NAO_RECONHECIDO','Os campos de login não são únicos ou não foram reconhecidos. O adaptador precisa ser ajustado ao layout real.');
   const botao=this.page.getByRole('button',{name:/^(entrar|acessar|login|iniciar sess[aã]o|fazer login)$/i});
   if(await botao.count()!==1)throw new ErroTribemd('LOGIN_LAYOUT_NAO_RECONHECIDO','O botão de login não foi reconhecido com segurança.');
   etapa='preenchendo_email';await emailInput.fill(email);etapa='preenchendo_senha';await senhaInput.fill(senha);signal.throwIfAborted();
   etapa='enviando_login';rede.marcarEnvioLogin();await botao.click();etapa='confirmando_login';
   try{await this.page.waitForURL(u=>u.origin===origem&&!/^\/login(?:\/|$)/.test(u.pathname),{timeout:15000});}
   catch{throw new ErroTribemd('LOGIN_NAO_CONFIRMADO','O login não foi confirmado. Confira as credenciais; também pode haver uma validação adicional. Não repetimos o envio automaticamente.');}
   etapa='verificando_pos_login';await this.page.waitForLoadState('domcontentloaded');
   const desafio=await this.page.getByText(/autentica[cç][aã]o de dois fatores|c[oó]digo de verifica[cç][aã]o|captcha/i).count();
   if(desafio)throw new ErroTribemd('VALIDACAO_ADICIONAL','O TribemD pediu uma validação adicional. Este piloto não contorna CAPTCHA ou autenticação em duas etapas.');
   if(await this.page.locator('input[type=password]:visible').count())throw new ErroTribemd('LOGIN_NAO_CONFIRMADO','O portal ainda apresenta um formulário de autenticação.');
   // Não confundir um redirecionamento intermediário com autenticação.
   const menu=this.page.locator('a,nav button,aside button,[role=navigation] button,[role=tab]').filter({hasText:/^(pacientes|meus pacientes|clientes|agenda|agendamentos)$/i});
   try{await menu.first().waitFor({state:'visible',timeout:12000});}
   catch{throw new ErroTribemd('POS_LOGIN_LAYOUT_NAO_RECONHECIDO','O portal saiu do login, mas os menus de pacientes e agenda não foram reconhecidos. Precisamos ajustar a navegação ao layout real.');}
   this.autenticado=true;
  }catch(erro){
   if(signal.aborted)throw erro;
   const diagnostico=await this.diagnosticarLogin(etapa,statusHttp);
   diagnostico.rede=await rede.concluir();
   if(erro instanceof ErroTribemd)throw new ErroTribemd(erro.codigo,erro.message,diagnostico);
   const mensagem=erro instanceof Error?erro.message:'';
   diagnostico.tipoFalha=erro instanceof Error&&erro.name==='TimeoutError'?'tempo_esgotado':/ERR_NAME_NOT_RESOLVED/.test(mensagem)?'dns':/ERR_CERT_|ERR_SSL_/.test(mensagem)?'tls':/net::ERR_/.test(mensagem)?'conexao':'outro';
   if(etapa==='abrindo_login')throw new ErroTribemd(diagnostico.tipoFalha==='tempo_esgotado'?'LOGIN_CARREGAMENTO_TIMEOUT':'LOGIN_CONEXAO_FALHOU','O navegador não conseguiu carregar o login do TribemD. Confira a etapa e o tipo de falha no diagnóstico.',diagnostico);
   if(etapa==='aguardando_formulario')throw new ErroTribemd('LOGIN_LAYOUT_NAO_RECONHECIDO','O formulário de senha não ficou disponível no prazo. Confira as contagens de campos e o status HTTP no diagnóstico para ajustar o acesso ao portal.',diagnostico);
   throw new ErroTribemd('LOGIN_INTERACAO_FALHOU','Não foi possível concluir uma etapa do formulário de login. Confira o diagnóstico; o envio não será repetido automaticamente.',diagnostico);
  }finally{email='';senha='';signal.removeEventListener('abort',abort);await rede.concluir();}
 }
 private async diagnosticarLogin(etapa:string,statusHttp?:number):Promise<DiagnosticoLoginTribemd>{
  const diagnostico:DiagnosticoLoginTribemd={etapa,statusHttp};
  const page=this.page;if(!page||page.isClosed())return diagnostico;
  // Somente tipos, contagens e categorias; nunca texto/valores de formulário ou URLs com parâmetros.
  try{const caminho=new URL(page.url()).pathname;diagnostico.pagina=caminho==='/login'?'login':caminho==='/inicio'?'inicio':'outra';
   const estrutura=await page.evaluate<{campos:{senha:number;email:number;texto:number;outros:number};botoesLogin:number;desafio:boolean}>(String.raw`(() => {
    const visivel=e=>e.getClientRects().length>0;
    const inputs=Array.from(document.querySelectorAll('input')).filter(visivel);
    const senha=inputs.filter(e=>e.type==='password').length,email=inputs.filter(e=>e.type==='email').length,texto=inputs.filter(e=>e.type==='text').length;
    const botoesLogin=Array.from(document.querySelectorAll('button,[role=button],input[type=submit]')).filter(visivel).filter(e=>/^(entrar|acessar|login|iniciar sess[aã]o|fazer login)$/i.test((e.tagName==='INPUT'?e.value:e.textContent||'').trim())).length;
    const desafio=Array.from(document.querySelectorAll('p,label,[role=alert]')).filter(visivel).some(e=>/autentica[cç][aã]o de dois fatores|c[oó]digo de verifica[cç][aã]o|captcha/i.test(e.textContent||''));
    return {campos:{senha,email,texto,outros:inputs.length-senha-email-texto},botoesLogin,desafio};
   })()`);Object.assign(diagnostico,estrutura);
  }catch{ /* A página pode fechar durante o cancelamento; a etapa conhecida continua disponível. */ }
  return diagnostico;
 }
 private obterPagina(){if(!this.autenticado||!this.page||this.fechado)throw new ErroTribemd('SESSAO_NAO_AUTENTICADA','O login precisa estar confirmado para ler dados.');return this.page;}
 async ler():Promise<LeituraTribemd>{
  const page=this.obterPagina();if(new URL(page.url()).origin!==origem)throw new ErroTribemd('DESTINO_NAO_PERMITIDO','A navegação saiu do portal permitido.');
  const raw=await page.evaluate<{tabelas:TelaTribemd['tabelas'];campos:TelaTribemd['campos'];links:{texto:string;href:string;emTabela:boolean;paginacao:boolean}[];botoes:string[];linhas:number;limitada:boolean}>(String.raw`(() => {
   const visivel=(e)=>!!e.getClientRects().length;
   const normalizar=(s)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[:*]/g,'').trim();
   const permitidos=['nome','nome completo','paciente','cliente','cpf','cpf do paciente','email','e-mail','telefone','celular','whatsapp','telefone celular','id','codigo','id do paciente','data','data da consulta','data do agendamento','horario','hora','status','situacao','profissional','valor','valor da consulta'];
   const permitido=(s)=>permitidos.includes(normalizar(s));
   const tabelas=[];let linhas=0,limitada=false;
   for(const table of document.querySelectorAll('table,[role=table]')){
    if(!visivel(table))continue;const cab=Array.from(table.querySelectorAll('th,[role=columnheader]')).map(e=>e.textContent?.trim()||'');
    const indices=cab.map((c,i)=>permitido(c)?i:-1).filter(i=>i>=0);if(!indices.length)continue;
    const rows=Array.from(table.querySelectorAll('tr,[role=row]')).filter(r=>r.querySelector('td,[role=cell]'));
    linhas+=rows.length;if(rows.length>100)limitada=true;
    const paciente=!cab.some(c=>['data','data da consulta','data do agendamento'].includes(normalizar(c)))&&cab.some(c=>['cpf','email','e-mail','telefone','celular'].includes(normalizar(c)));
    tabelas.push({colunas:[...indices.map(i=>cab[i]),...(paciente?['ID']:[])],linhas:rows.slice(0,100).map(r=>{const cells=Array.from(r.querySelectorAll('td,[role=cell]'));const valores=indices.map(i=>(cells[i]?.textContent||'').trim().slice(0,400));
     if(paciente){const link=r.querySelector('a[href]');let id='';if(link){const u=new URL(link.href);if(u.origin===location.origin)id=u.pathname.match(/\/(?:pacientes?|clientes?)\/([\w-]+)\/?$/)?.[1]||'';}valores.push(id);}return valores;})});
   }
   const campos=[];
   if(/\/(pacientes?|clientes?)(\/|$)/i.test(location.pathname)){
    for(const label of document.querySelectorAll('label,dt')){
     const rotulo=(label.textContent||'').trim();if(!permitido(rotulo)||!visivel(label))continue;
     const input=label instanceof HTMLLabelElement?label.control:null;
     const valor=input instanceof HTMLInputElement&&input.type!=='password'?input.value:label.tagName==='DT'?label.nextElementSibling?.textContent:label.nextElementSibling?.textContent;
     if(valor)campos.push({rotulo,valor:valor.trim().slice(0,400)});
    }
   }
   const links=Array.from(document.querySelectorAll('a[href]')).filter(visivel).map(a=>({texto:(a.textContent||'').trim(),href:a.href,emTabela:!!a.closest('table,[role=table]'),paginacao:!!a.closest('[aria-label*=pagina],[aria-label*=Pagina],.pagination')}));
   const botoes=Array.from(document.querySelectorAll('nav button,aside button,[role=navigation] button,[role=tab]')).filter(e=>visivel(e)&&!e.closest('form')).map(e=>(e.textContent||'').trim()).filter(s=>/^(pacientes|meus pacientes|clientes|agenda|agendamentos)$/i.test(s));
   return {tabelas,campos,links,botoes,linhas,limitada};
  })()`);
  for(const link of raw.links){
   const texto=link.texto.toLowerCase().trim();let acao:OpcaoTribemd['acao']|null=null;
   if(/^(pacientes|meus pacientes|clientes)$/.test(texto))acao='abrir_pacientes';
   else if(/^(agenda|agendamentos)$/.test(texto))acao='abrir_agenda';
   else if(link.emTabela&&/\/(pacientes?|clientes?)\/[\w-]+\/?$/.test(new URL(link.href).pathname))acao='ler_cadastro';
   else if(link.paginacao&&/^(pr[oó]xim[ao]|next|›|»)$/i.test(texto))acao='proxima_pagina';
   if(!acao)continue;
   const u=new URL(link.href);if(u.origin!==origem||/editar|anamnese|prontuario|prontuário|pagamento|financeiro|excluir|delete|novo|criar|logout|sair|config/i.test(u.pathname+u.search))continue;
   u.hash='';if(this.visitadas.has(u.href)||u.href===page.url())continue;
   if(acao==='ler_cadastro'&&[...this.acoes.values()].filter(a=>a.opcao.acao==='ler_cadastro').length>=20)continue;
   const id=createHash('sha256').update(acao+'|'+u.href).digest('hex').slice(0,20);this.acoes.set(id,{opcao:{id,acao},url:u.href});
  }
  for(const botao of raw.botoes){const acao:OpcaoTribemd['acao']=/^(pacientes|meus pacientes|clientes)$/i.test(botao)?'abrir_pacientes':'abrir_agenda';
   const id=createHash('sha256').update(acao+'|botao').digest('hex').slice(0,20);if(!this.visitadas.has(id))this.acoes.set(id,{opcao:{id,acao},url:page.url(),botao});}
  const u=new URL(page.url());u.search='';u.hash='';
  return {visao:await this.observarControles(),tela:{url:u.href,campos:raw.campos,tabelas:raw.tabelas},opcoes:[...this.acoes.values()].map(a=>a.opcao),
   diagnostico:{caminho:u.pathname,tabelas:raw.tabelas.length,linhas:raw.linhas,campos:[...new Set(raw.campos.map(c=>campoTribemd(c.rotulo)).filter((s):s is string=>!!s))],limitada:raw.limitada}};
 }
 async executar(id:string){
  const page=this.obterPagina(),a=this.acoes.get(id);if(!a)throw new ErroTribemd('FERRAMENTA_NAO_PERMITIDA','A ação não foi oferecida pelo navegador.');
  this.acoes.delete(id);this.visitadas.add(a.botao?id:a.url);
  if(a.botao){if(page.url()!==a.url)await page.goto(a.url,{waitUntil:'domcontentloaded',timeout:20000});
   const nome=new RegExp('^'+a.botao.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'$','i');
   const b=page.locator('nav button:not(form *),aside button:not(form *),[role=navigation] button:not(form *),[role=tab]:not(form *)').filter({hasText:nome});
   if(await b.count()!==1)throw new ErroTribemd('NAVEGACAO_AMBIGUA','O menu de leitura não é único nesta tela.');await b.click();await page.waitForLoadState('domcontentloaded');
  }else await page.goto(a.url,{waitUntil:'domcontentloaded',timeout:20000});
  // Cabeçalhos vazios podem aparecer antes das linhas em uma SPA.
  try{
   await page.waitForFunction(String.raw`(() => {
    const visivel=e=>e.getClientRects().length>0;
    if(Array.from(document.querySelectorAll('[aria-busy=true],[role=progressbar]')).some(visivel))return false;
    const linhas=Array.from(document.querySelectorAll('table tr,[role=table] [role=row]')).filter(visivel);
    if(linhas.some(r=>r.querySelector('td,[role=cell]')&&(r.textContent||'').trim()))return true;
    const vazia=Array.from(document.querySelectorAll('[role=status],.empty-state,[data-empty-state],p,td')).filter(visivel);
    if(vazia.some(e=>/^(nenhum(?:a)? (?:paciente|cliente|agendamento|registro|resultado|consulta)(?:s)?(?: encontrado(?:s|a|as)?)?\.?|não há (?:pacientes|clientes|agendamentos|registros|resultados|consultas)\.?)$/i.test((e.textContent||'').trim())))return true;
    return DETALHE_PERMITIDO && Array.from(document.querySelectorAll('label,dt')).filter(visivel).some(e=>{const c=e instanceof HTMLLabelElement?e.control:null;return c instanceof HTMLInputElement&&c.type!=='password'?!!c.value:!!(e.nextElementSibling?.textContent||'').trim();});
   })()`.replace('DETALHE_PERMITIDO',a.opcao.acao==='ler_cadastro'?'true':'false'),{},{timeout:12000});
  }catch{throw new ErroTribemd('TELA_SEM_ESTRUTURA_RECONHECIDA','O menu foi aberto, mas não foi possível confirmar os dados carregados ou uma lista vazia. O layout real precisa ser adaptado; os dados já lidos foram preservados.');}
 }
 async encerrar(){if(!this.fechamento){this.fechado=true;this.autenticado=false;this.acoes.clear();this.fechamento=Promise.resolve().then(()=>this.fechar());}await this.fechamento;}
}
