import { randomUUID } from 'node:crypto';
import { nomeProfissionalValido, normalizarCrm } from '../conta/validar-dados-emissao.js';
import type { ConsultaEmpresa, ConsultaRegistro, EmpresaConsultada } from './consultas.js';
export interface CandidatoCadastro { id:string; nome:string; crm?:string; uf?:string; origem?:string }
export interface PendenciaCadastro { id:string; tipo:'responsavel'|'nome'|'crm'; candidatos:CandidatoCadastro[]; perguntaConfirmada:string|null; escolhasApresentadas?:Record<string,string> }
export interface DadosCadastro { empresa?:EmpresaConsultada; nomeConfirmado?:string; pendencia?:PendenciaCadastro; cadastroIndisponivel?:boolean; crmOrigem?:string }
export interface PerfilCadastro { nome:string; crm:string|null; nomeConfirmado:boolean }
export interface ResultadoEnriquecimento { estado:'aguardando_confirmacao'|'concluido'|'retentar'; dados:DadosCadastro; nome?:string; crm?:string; codigo?:string }
export function criarPendencia(tipo:PendenciaCadastro['tipo'],candidatos:CandidatoCadastro[]=[]):PendenciaCadastro{return {id:randomUUID(),tipo,candidatos,perguntaConfirmada:null};}
const normal=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
export async function enriquecerCadastro(entrada:{documento:string|null;perfil:PerfilCadastro;dados:DadosCadastro},empresa:ConsultaEmpresa,registro:ConsultaRegistro,consultarCpf?:(cpf:string)=>Promise<{nome:string}|null>):Promise<ResultadoEnriquecimento>{
 const dados:DadosCadastro={...entrada.dados};delete dados.pendencia;
 const nome=dados.nomeConfirmado || (entrada.perfil.nomeConfirmado?entrada.perfil.nome:undefined);
 let candidatos:CandidatoCadastro[]=[];
 if (!dados.empresa && !dados.cadastroIndisponivel && entrada.documento?.length===14){
  const r=await empresa.consultar(entrada.documento);
  if(r.estado!=='consultado')return {estado:'retentar',dados,codigo:r.codigo};
  dados.empresa=r.dados;
 }
 if(!nome){
  if(dados.empresa)candidatos=dados.empresa.candidatos.map(c=>({id:randomUUID(),nome:c.nome,origem:c.origem}));
  else if(entrada.documento?.length===11 && !dados.cadastroIndisponivel){
   const pessoa=await consultarCpf?.(entrada.documento);
   if(!pessoa || !nomeProfissionalValido(pessoa.nome))return {estado:'retentar',dados,codigo:'CPF_CONSULTA_INDISPONIVEL'};
   candidatos=[{id:randomUUID(),nome:pessoa.nome,origem:'Hub do Desenvolvedor / CPF do titular'}];
  }
  if(!candidatos.length && nomeProfissionalValido(entrada.perfil.nome))candidatos=[{id:randomUUID(),nome:entrada.perfil.nome,origem:'Cadastro existente, confirmação pendente'}];
  dados.pendencia=criarPendencia(candidatos.length?'responsavel':'nome',candidatos);
  return {estado:'aguardando_confirmacao',dados};
 }
 dados.nomeConfirmado=nome;
 if(normalizarCrm(entrada.perfil.crm))return {estado:'concluido',dados};
 const r=await registro.buscar(nome);
 if(r.estado==='consultado'){
  const validos=r.dados.filter(c=>normal(c.nomeCompleto)===normal(nome)&&normalizarCrm(`${c.crm}/${c.uf}`));
  const unicos=[...new Map(validos.map(c=>[normalizarCrm(`${c.crm}/${c.uf}`)!,c])).values()];
  if(unicos.length===1 && r.dados.length===1){dados.crmOrigem='Consulta profissional oficial';return {estado:'concluido',dados,crm:normalizarCrm(`${unicos[0].crm}/${unicos[0].uf}`)!};}
  candidatos=unicos.map(c=>({id:randomUUID(),nome:c.nomeCompleto,crm:c.crm,uf:c.uf,origem:'Consulta profissional oficial'}));
 }else if(r.estado==='indisponivel' && r.codigo!=='CRM_FONTE_NAO_CONFIGURADA')return {estado:'retentar',dados,codigo:r.codigo};
 dados.pendencia=criarPendencia('crm',candidatos);
 return {estado:'aguardando_confirmacao',dados};
}
