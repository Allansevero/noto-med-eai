import type { Page } from 'playwright-core';
import type { ConsultaTribemd } from './tribemd-leitura.js';

export class ErroDetalhesTribemd extends Error { constructor(public codigo:string){super(codigo);} }
export interface DadosConsultaTribemd {
 nomeCompleto:string|null;cpf:string|null;
 contato:{celular:string|null;telefone:string|null;email:string|null};
 valorConsulta:string|null;valorCobrado:string|null;
 pendencias:string[];codigo?:string;
}
export interface ResumoDetalhesTribemd { selecionadas:number;processadas:number;pendentes:number;comPendencias:number;incluiAtendidos:boolean }
const idValido=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,15}$/.test(v);
const texto=(v:unknown,max=200)=>typeof v==='string'&&v.trim()?v.trim().slice(0,max):null;
const dinheiro=(v:unknown)=>{
 if(typeof v!=='number'&&typeof v!=='string'||typeof v==='string'&&!/^\d+(?:\.\d{1,2})?$/.test(v))return null;
 const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=999999999?n.toFixed(2):null;
};
const cpf=(v:unknown)=>{const s=texto(v,20);return s&&/^\d{3}\.?\d{3}\.?\d{3}-?\d{2}$/.test(s)?s.replace(/\D/g,''):null;};
interface Registro {
 id:string|null;pacienteId:string|null;status:number|null;valor:unknown;valorCobrado:unknown;
 paciente:{id:string|null;nome:unknown;cpf:unknown;celular:unknown;telefone:unknown;email:unknown}|null;
}
const codigoLeituraDetalhes=String.raw`async({tipo,id,headers,tempo})=>{
  if(location.origin!=='https://app.tribemd.com')return {codigo:'ORIGEM_INVALIDA'};
  const limite=2*1024*1024,controller=new AbortController(),timer=setTimeout(()=>controller.abort(),tempo);
  try{
   const r=await fetch('/api/'+tipo+'/'+id,{method:'GET',credentials:'same-origin',redirect:'error',cache:'no-store',headers,signal:controller.signal});
   if(r.status===401)return {codigo:'SESSAO_EXPIRADA'};
   if(r.status===403)return {codigo:'DETALHES_SEM_PERMISSAO'};
   if(!r.ok)return {codigo:'DETALHES_HTTP_ERRO'};
   if(Number(r.headers.get('content-length'))>limite){await r.body?.cancel();return {codigo:'DETALHES_LIMITE_EXCEDIDO'};}
   const reader=r.body?.getReader();if(!reader)return {codigo:'DETALHES_FORMATO_NAO_RECONHECIDO'};
   let total=0,conteudo='';const decoder=new TextDecoder();
   try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>limite){await reader.cancel();return {codigo:'DETALHES_LIMITE_EXCEDIDO'};}conteudo+=decoder.decode(value,{stream:true});}conteudo+=decoder.decode();}
   finally{reader.releaseLock();}
   const bruto=JSON.parse(conteudo),d=bruto?.data??bruto;
   const ident=(v)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0?String(v):typeof v==='string'&&/^[1-9]\d{0,15}$/.test(v)?v:null;
   const escalar=(v)=>typeof v==='string'?v.slice(0,254):typeof v==='number'?v:null;
   if(!d||typeof d!=='object'||Array.isArray(d)||ident(d.id)!==id)return {codigo:'DETALHES_VINCULO_NAO_CONFIRMADO'};
   const p=tipo==='pacientes'?d:d.pacientes;
   return {registro:{id:ident(d.id),pacienteId:ident(d.paciente_id)??ident(d.pacientes?.id),status:typeof d.status==='number'||typeof d.status==='string'?Number(d.status):null,
    valor:escalar(d.valor),valorCobrado:escalar(d.valor_cobrado),paciente:p&&typeof p==='object'&&!Array.isArray(p)?{
     id:ident(p.id),nome:escalar(p.nome),cpf:escalar(p.cpf),celular:escalar(p.celular),telefone:escalar(p.telefone),email:escalar(p.email)
    }:null}};
  }catch{return {codigo:controller.signal.aborted?'DETALHES_TEMPO_ESGOTADO':'DETALHES_REDE_OU_FORMATO_INVALIDO'};}
  finally{clearTimeout(timer);}
 }`;

/** GET no mesmo navegador e origem. Somente a projeção necessária sai da página. */
async function buscar(page:Page,tipo:'atendimentos'|'pacientes',id:string,headers:Record<string,string>,tempo:number):Promise<Registro>{
 if(!idValido(id))throw new ErroDetalhesTribemd('IDENTIFICADOR_AUSENTE');
 const resposta=await page.evaluate<{codigo:string}|{registro:Registro}>('('+codigoLeituraDetalhes+')('+JSON.stringify({tipo,id,headers,tempo})+')').catch(()=>{throw new ErroDetalhesTribemd('DETALHES_NAVEGADOR_INDISPONIVEL');});
 if('codigo'in resposta)throw new ErroDetalhesTribemd(resposta.codigo!);
 return resposta.registro;
}
function campos(dados:DadosConsultaTribemd){
 dados.pendencias=[];
 if(!dados.nomeCompleto)dados.pendencias.push('NOME_COMPLETO_AUSENTE');
 if(!dados.cpf)dados.pendencias.push('CPF_AUSENTE_OU_FORMATO_INVALIDO');
 if(!dados.contato.celular&&!dados.contato.telefone&&!dados.contato.email)dados.pendencias.push('CONTATO_AUSENTE');
 if(dados.valorConsulta===null)dados.pendencias.push('VALOR_CONSULTA_AUSENTE');
}
export async function detalharConsultasTribemd(page:Page,consultas:ConsultaTribemd[],headers:Record<string,string>,incluiAtendidos=true):Promise<{consultas:ConsultaTribemd[];resumo:ResumoDetalhesTribemd}>{
 const selecionadas=consultas.filter(c=>c.situacao==='finalizado'||incluiAtendidos&&c.situacao==='atendido'),saida:ConsultaTribemd[]=[],prazo=Date.now()+60000;
 for(const consulta of selecionadas.slice(0,100)){
  if(Date.now()>=prazo)break;
  const dados:DadosConsultaTribemd={nomeCompleto:null,cpf:null,contato:{celular:null,telefone:null,email:null},valorConsulta:null,valorCobrado:null,pendencias:[]};
  try{
   if(!idValido(consulta.atendimentoId)||!idValido(consulta.pacienteId))throw new ErroDetalhesTribemd('IDENTIFICADOR_AUSENTE');
   const tempo=()=>Math.max(1,Math.min(8000,prazo-Date.now()));
   const a=await buscar(page,'atendimentos',consulta.atendimentoId,headers,tempo());
   if(a.pacienteId!==consulta.pacienteId)throw new ErroDetalhesTribemd('DETALHES_VINCULO_NAO_CONFIRMADO');
   if(a.status!==10&&!(incluiAtendidos&&a.status===8))throw new ErroDetalhesTribemd('CONSULTA_STATUS_ALTERADO');
   dados.valorConsulta=dinheiro(a.valor);dados.valorCobrado=dinheiro(a.valorCobrado);
   let p=a.paciente?.id===consulta.pacienteId?a.paciente:null;
   const aplicar=()=>{
    if(!p)return;
    dados.nomeCompleto=texto(p.nome)??dados.nomeCompleto;
    const documento=cpf(p.cpf);
    if(dados.cpf&&documento&&dados.cpf!==documento){dados.cpf=null;dados.codigo='CPF_DIVERGENTE_ENTRE_FONTES';}
    else dados.cpf=documento??dados.cpf;
    dados.contato={celular:texto(p.celular,40)??dados.contato.celular,telefone:texto(p.telefone,40)??dados.contato.telefone,email:texto(p.email,254)??dados.contato.email};
   };
   aplicar();
   if(!dados.nomeCompleto||!dados.cpf||!dados.contato.celular&&!dados.contato.telefone&&!dados.contato.email){
    const paciente=await buscar(page,'pacientes',consulta.pacienteId,headers,tempo());
    p=paciente.paciente;aplicar();
   }
  }catch(e){
   const codigo=e instanceof ErroDetalhesTribemd?e.codigo:'DETALHES_NAO_CONCLUIDOS';
   if(codigo==='SESSAO_EXPIRADA')throw new ErroDetalhesTribemd(codigo);
   dados.codigo=codigo;
  }
  campos(dados);saida.push({...consulta,dados});
 }
 return {consultas:saida,resumo:{selecionadas:selecionadas.length,processadas:saida.length,pendentes:selecionadas.length-saida.length,comPendencias:saida.filter(c=>c.dados?.codigo||c.dados?.pendencias.length).length,incluiAtendidos}};
}
