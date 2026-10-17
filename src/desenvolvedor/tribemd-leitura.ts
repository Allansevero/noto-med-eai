export const origemTribemd='https://app.tribemd.com';
export const agendaTribemd='/atendimentos/agenda';
export const loginTribemd=origemTribemd+'/login?continue='+agendaTribemd;
const normalizar=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[:*]/g,'').trim();
export interface ConsultaTribemd { nome:string; ultimaConsulta:string|null; dataConsultaObservada?:string; evidencia:'coluna_ultima_consulta'|'consulta_realizada_observada' }
export interface TabelaConsulta { colunas:string[]; linhas:string[][] }
function dataISO(v:string):string|null {
 const m=v.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/), n=v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|\s|$)/);
 const iso=m?`${m[3]}-${m[2]}-${m[1]}`:n?`${n[1]}-${n[2]}-${n[3]}`:null;
 if(!iso)return null; const d=new Date(iso+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:null;
}
export function lerConsultas(tabelas:TabelaConsulta[],hoje:string):ConsultaTribemd[] {
 const resultado:ConsultaTribemd[]=[];
 for(const t of tabelas){
  const c=t.colunas.map(normalizar), nome=c.findIndex(v=>['nome','nome completo','paciente','cliente'].includes(v));
  if(nome<0)continue;
  const ultima=c.findIndex(v=>['ultima consulta','data da ultima consulta','ultimo atendimento','ultima consulta realizada'].includes(v));
  const data=c.findIndex(v=>['data','data da consulta','data do atendimento'].includes(v)), status=c.findIndex(v=>['status','situacao'].includes(v));
  for(const l of t.linhas){
   const n=l[nome]?.trim(); if(!n)continue;
   const d=dataISO(l[ultima>=0?ultima:data]||'');if(!d||d>hoje)continue;
   // Uma consulta marcada/passada não comprova comparecimento. Não inferir pelo dia.
   if(ultima<0&&(status<0||!['realizada','realizado','atendido','atendida','concluido','concluida','finalizado','finalizada'].includes(normalizar(l[status]||''))))continue;
   resultado.push(ultima>=0?{nome:n,ultimaConsulta:d,evidencia:'coluna_ultima_consulta'}:{nome:n,ultimaConsulta:null,dataConsultaObservada:d,evidencia:'consulta_realizada_observada'});
  }
 }
 // Não mesclar homônimos nem chamar o máximo da página de última consulta histórica.
 return resultado;
}
export function permitirRequisicaoTribemd(url:string,metodo:string,tipo:string,autenticando:boolean) {
 const u=new URL(url);if(!['https:','http:'].includes(u.protocol))return false;
 // Login é a única escrita permitida. Todo o restante fica limitado a GET/HEAD.
 if(!['GET','HEAD','OPTIONS'].includes(metodo))
  return autenticando&&metodo==='POST'&&u.origin===origemTribemd&&u.pathname==='/api/usuarios/login';
 if(tipo==='document')return u.origin===origemTribemd&&(['/','/login','/inicio','/atendimentos/agenda','/pacientes'].includes(u.pathname)||autenticando&&/^\/(auth|mfa|verificacao|cdn-cgi)\//.test(u.pathname));
 // Não acessar endpoints de ação disfarçados de GET.
 if(/(?:^|\/)(?:logout|delete|remove|update|create|save|excluir|salvar|editar|novo|cancelar)(?:\/|$)/i.test(u.pathname))return false;
 if(tipo==='websocket'||tipo==='ping')return false;
 return u.origin===origemTribemd;
}
