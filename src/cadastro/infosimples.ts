import {nomeProfissionalValido,normalizarCrm} from '../conta/validar-dados-emissao.js';
import type {DadosMedicoOnline} from '../medico/io/buscar-medico-online.js';
import type {ConsultaRegistro,ResultadoConsulta} from './consultas.js';
const ENDPOINT='https://api.infosimples.com/api/v2/consultas/cfm/cadastro';
const normal=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/g,' ').trim().toUpperCase();
const ufValida=(v:unknown):v is string=>typeof v==='string'&&/^[A-Z]{2}$/.test(v)&&normalizarCrm(`1/${v}`)!==null;
const falha=(codigo:string):ResultadoConsulta<DadosMedicoOnline[]>=>({estado:'indisponivel',codigo});
type Item={nome:string;inscricao:string;primeira_inscricao_uf_data?:unknown;normalizado_primeira_inscricao_uf_data?:unknown;especialidade?:unknown;especialidade_lista?:unknown;situacao?:unknown};
type Consulta={item:Item;ufFiltro?:string}|{codigo:string;vazio?:boolean};

/** Contrato v2 CFM/Cadastro fornecido pelo usuário. Nunca registra corpo ou token. */
export class InfosimplesConsultaRegistro implements ConsultaRegistro {
 constructor(private token:string,private requisitar:typeof fetch=fetch){}
 private async consultar(nome:string,uf?:string):Promise<Consulta>{
  try{
   const params=new URLSearchParams({token:this.token,nome,timeout:'90'});if(uf)params.set('uf',uf);
   const r=await this.requisitar(ENDPOINT,{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:params,redirect:'error',signal:AbortSignal.timeout(95000)});
   if(!r.ok)return {codigo:`INFOSIMPLES_HTTP_${r.status}`};
   const d=await r.json();
   if(d?.code!==200)return {codigo:Number.isInteger(d?.code)&&d.code>=100&&d.code<=999?`INFOSIMPLES_API_${d.code}`:'INFOSIMPLES_RESPOSTA_INVALIDA'};
   if(!Array.isArray(d.data)||d.data_count!==d.data.length)return {codigo:'INFOSIMPLES_RESPOSTA_INVALIDA'};
   if(d.data.length===0)return {codigo:'INFOSIMPLES_NAO_ENCONTRADO',vazio:true};
   const item=d.data[0];
   if(d.data.length!==1||typeof item?.nome!=='string'||normal(item.nome)!==normal(nome)||typeof item.inscricao!=='string')return {codigo:'INFOSIMPLES_RESULTADO_AMBIGUO'};
   if(uf&&d.header?.parameters?.uf!==uf)return {codigo:'INFOSIMPLES_UF_NAO_CONFIRMADA'};
   return {item,ufFiltro:uf};
  }catch{return {codigo:'INFOSIMPLES_CONSULTA_INDISPONIVEL'};}
 }
 async buscar(nome:string,uf?:string):Promise<ResultadoConsulta<DadosMedicoOnline[]>>{
  if(!this.token.trim())return falha('CRM_FONTE_NAO_CONFIGURADA');
  if(!nomeProfissionalValido(nome)||(uf!==undefined&&!ufValida(uf)))return falha('INFOSIMPLES_PARAMETRO_INVALIDO');
  let consulta=await this.consultar(nome.trim(),uf);
  if('codigo' in consulta)return consulta.vazio?{estado:'nao_encontrado',codigo:consulta.codigo}:falha(consulta.codigo);
  let crm=normalizarCrm(consulta.item.inscricao.replace(/[.\s-]/g,''));
  if(crm?.includes('/')&&consulta.ufFiltro&&crm.split('/')[1]!==consulta.ufFiltro)return falha('INFOSIMPLES_UF_NAO_CONFIRMADA');
  if(!crm?.includes('/')&&!consulta.ufFiltro){
   // A UF da primeira inscrição é apenas um filtro sugerido, nunca a UF do CRM.
   // Confirmar a associação em outra consulta restrita ao mesmo nome + UF.
   const primeira=consulta.item.normalizado_primeira_inscricao_uf_data??consulta.item.primeira_inscricao_uf_data;
   if(!ufValida(primeira))return falha('INFOSIMPLES_UF_NAO_CONFIRMADA');
   consulta=await this.consultar(nome.trim(),primeira);
   if('codigo' in consulta)return consulta.vazio?{estado:'nao_encontrado',codigo:consulta.codigo}:falha(consulta.codigo);
   crm=normalizarCrm(consulta.item.inscricao.replace(/[.\s-]/g,''));
  }
  if(!crm)return falha('INFOSIMPLES_INSCRICAO_INVALIDA');
  if(!crm.includes('/'))crm=normalizarCrm(`${crm}/${consulta.ufFiltro}`);
  if(!crm?.includes('/')||consulta.ufFiltro&&crm.split('/')[1]!==consulta.ufFiltro)return falha('INFOSIMPLES_UF_NAO_CONFIRMADA');
  const item=consulta.item;
  const especialidades=Array.isArray(item.especialidade_lista)?item.especialidade_lista.filter((s):s is string=>typeof s==='string'):typeof item.especialidade==='string'?[item.especialidade]:[];
  const rqes=[...new Set([...especialidades.join('; ').matchAll(/\bRQE\s*(?:N[º°O.]?\s*)?[:\-]?\s*(\d{1,12})\b/gi)].map(m=>m[1]).filter(n=>/[1-9]/.test(n)))];
  return {estado:'consultado',dados:[{nomeCompleto:item.nome.trim(),crm:crm.split('/')[0],uf:crm.split('/')[1],rqe:rqes.length===1?rqes[0]:null,rqes,
   especialidade:especialidades.join('; '),situacao:typeof item.situacao==='string'?item.situacao:undefined,
   origem:'Infosimples / CFM',urlOrigem:'https://portal.cfm.org.br/busca-medicos/',verificado:false}]};
 }
}
