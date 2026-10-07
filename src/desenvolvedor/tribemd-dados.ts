import { validarCpf } from '../paciente/validar-cpf.js';
export interface TelaTribemd { url:string; campos:{rotulo:string;valor:string}[]; tabelas:{colunas:string[];linhas:string[][]}[] }
export interface OrigemTribemd { pagina:string;campo:string;valor:string }
export interface PacienteTribemd { id:string|null;nome:string|null;cpf:string|null;email:string|null;telefone:string|null;telefoneOriginal:string|null;origem:OrigemTribemd[];pendencias:string[] }
export interface AgendamentoTribemd { id:string|null;pacienteId:string|null;paciente:string|null;data:string|null;horario:string|null;situacao:string|null;profissional:string|null;valor:string|null;fuso:null;origem:OrigemTribemd[];pendencias:string[] }
export function campoTribemd(rotulo:string):string|null {
 const s=rotulo.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[:*]/g,'').trim();
 const mapas:Record<string,string>={nome:'nome','nome completo':'nome',paciente:'nome',cliente:'nome',cpf:'cpf','cpf do paciente':'cpf',email:'email','e-mail':'email',telefone:'telefone',celular:'telefone',whatsapp:'telefone','telefone celular':'telefone',id:'id','codigo':'id','id do paciente':'pacienteId',data:'data','data da consulta':'data','data do agendamento':'data',horario:'horario',hora:'horario',status:'situacao',situacao:'situacao',profissional:'profissional',valor:'valor','valor da consulta':'valor'};
 return mapas[s]||null;
}
export function normalizarTelefoneTribemd(v:string):string|null {
 const n=v.replace(/\D/g,'');if(/^55\d{10,11}$/.test(n))return n;
 if(/^\d{10,11}$/.test(n))return '55'+n;return null;
}
function dataTribemd(v:string):string|null {
 const m=v.match(/^(\d{4})-(\d{2})-(\d{2})(?:\b|T)/)||v.match(/^(\d{2})\/(\d{2})\/(\d{4})\b/)?.map((s,i,a)=>i===1?a[3]:i===3?a[1]:s);
 if(!m)return null;const iso=`${m[1]}-${m[2]}-${m[3]}`,d=new Date(iso+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===iso?iso:null;
}
export function extrairDadosTribemd(tela:TelaTribemd,inicio:string,fim:string) {
 const pacientes:PacienteTribemd[]=[],agendamentos:AgendamentoTribemd[]=[];let foraIntervalo=0,naoReconhecidos=0;
 const pagina=new URL(tela.url);pagina.search='';pagina.hash='';
 const processar=(campos:{rotulo:string;valor:string}[],agenda:boolean)=>{
  const v:Record<string,string>={},origem:OrigemTribemd[]=[];
  for(const c of campos){const k=campoTribemd(c.rotulo);if(!k||!c.valor.trim())continue;v[k]=c.valor.trim().slice(0,400);origem.push({pagina:pagina.href,campo:c.rotulo.slice(0,80),valor:v[k]});}
  if(!origem.length){naoReconhecidos++;return;}
  if(agenda){const data=v.data?dataTribemd(v.data):null;if(data&&(data<inicio||data>fim)){foraIntervalo++;return;}
   agendamentos.push({id:v.id||null,pacienteId:v.pacienteId||null,paciente:v.nome||null,data,horario:v.horario||null,situacao:v.situacao||null,profissional:v.profissional||null,valor:v.valor||null,fuso:null,origem,pendencias:[...(!data?['data_nao_reconhecida']:[]),'fuso_nao_informado','vinculo_paciente_nao_confirmado']});return;}
  if(!v.nome&&!v.cpf&&!v.email&&!v.telefone){naoReconhecidos++;return;}
  const idUrl=pagina.pathname.match(/\/(?:pacientes?|clientes?)\/([\w-]+)\/?$/)?.[1];
  if(!v.id&&idUrl){v.id=idUrl;origem.push({pagina:pagina.href,campo:'ID (URL do cadastro)',valor:idUrl});}
  const cpf=v.cpf?.replace(/\D/g,'')||'',telefone=v.telefone?normalizarTelefoneTribemd(v.telefone):null;
  const email=v.email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)?v.email.toLowerCase():null;
  pacientes.push({id:v.id||null,nome:v.nome||null,cpf:cpf&&validarCpf(cpf)?cpf:null,email,telefone,telefoneOriginal:v.telefone||null,origem,
   pendencias:[...(cpf&&!validarCpf(cpf)?['cpf_invalido']:[]),...(v.telefone&&!telefone?['telefone_invalido']:[]),...(v.email&&!email?['email_invalido']:[]),'vinculo_whatsapp_nao_confirmado']});
 };
 for(const tabela of tela.tabelas){const chaves=tabela.colunas.map(campoTribemd),agenda=chaves.includes('data')&&chaves.includes('nome');
  if(!agenda&&!chaves.some(k=>['cpf','email','telefone'].includes(k||''))){naoReconhecidos+=tabela.linhas.length;continue;}
  for(const linha of tabela.linhas)processar(tabela.colunas.map((rotulo,i)=>({rotulo,valor:linha[i]||''})),agenda);
 }
 if(tela.campos.length&&/\/(pacientes?|clientes?)(?:\/|$)/i.test(pagina.pathname))processar(tela.campos,false);
 return {pacientes,agendamentos,foraIntervalo,naoReconhecidos};
}
