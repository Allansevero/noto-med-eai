import { nomeProfissionalValido } from '../conta/validar-dados-emissao.js';
import type { DadosMedicoOnline } from '../medico/io/buscar-medico-online.js';
export interface CandidatoResponsavel { nome: string; origem: string }
export interface EmpresaConsultada { cnpj: string; razaoSocial: string; candidatos: CandidatoResponsavel[]; origem: string }
export type ResultadoConsulta<T> = { estado: 'consultado'; dados: T } | { estado: 'indisponivel' | 'nao_encontrado'; codigo: string };
export interface ConsultaEmpresa { consultar(cnpj: string): Promise<ResultadoConsulta<EmpresaConsultada>> }
export interface ConsultaRegistro { buscar(nome: string, uf?: string): Promise<ResultadoConsulta<DadosMedicoOnline[]>> }
const falha = (): ResultadoConsulta<EmpresaConsultada> => ({estado:'indisponivel',codigo:'CNPJ_CONSULTA_INDISPONIVEL'});
const pessoa = (nome: unknown): nome is string => nomeProfissionalValido(nome) && !/\b(ltda|limitada|eireli|sociedade|associacao|associação|empresa|clinica|clínica)\b/i.test(String(nome));
/** Fonte secundária já utilizada pelo sistema. Não altera enquadramento fiscal. */
export class BrasilApiConsultaEmpresa implements ConsultaEmpresa {
 constructor(private requisitar: typeof fetch = fetch) {}
 async consultar(cnpj: string): Promise<ResultadoConsulta<EmpresaConsultada>> {
  if (!/^\d{14}$/.test(cnpj)) return falha();
  try {
   const r=await this.requisitar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(8000)});
   if (!r.ok) return falha();
   const d=await r.json();
   if (typeof d.cnpj!=='string' || d.cnpj.replace(/\D/g,'')!==cnpj || typeof d.razao_social!=='string') return falha();
   const origem='BrasilAPI / Minha Receita';
   const candidatos: CandidatoResponsavel[]=Array.isArray(d.qsa)?d.qsa.filter((s:any)=>s?.identificador_de_socio!==1 && pessoa(s?.nome_socio)).map((s:any)=>({nome:s.nome_socio.trim(),origem})):[];
   return {estado:'consultado',dados:{cnpj,razaoSocial:d.razao_social.slice(0,200),origem,candidatos:deduplicar(candidatos)}};
  } catch { return falha(); }
 }
}
function deduplicar(candidatos:CandidatoResponsavel[]):CandidatoResponsavel[]{
 const nomes=new Set<string>();return candidatos.filter(c=>{const n=c.nome.toLocaleLowerCase('pt-BR');if(nomes.has(n))return false;nomes.add(n);return true;}).slice(0,50);
}
/** Parser do contrato CNPJ documentado pelo Hub. */
export function lerRespostaHubCnpj(corpo: unknown, cnpj: string): ResultadoConsulta<EmpresaConsultada> {
 const d=corpo as any, r=d?.result;
 if (!/^\d{14}$/.test(cnpj) || d?.return!=='OK' || ![true,'true'].includes(d?.status) || typeof r?.numero_de_inscricao!=='string' || r.numero_de_inscricao.replace(/\D/g,'')!==cnpj || typeof r.nome!=='string' || !r.nome.trim()) return falha();
 const origem='Hub do Desenvolvedor / quadro_socios';
 const candidatos:CandidatoResponsavel[]=(Array.isArray(r.quadro_socios)?r.quadro_socios:[]).flatMap((s:unknown)=>{
  if(typeof s!=='string')return [];
  const nome=s.replace(/\s+\d{2}\s*-\s*.+$/u,'').trim();return pessoa(nome)?[{nome,origem}]:[];
 });
 return {estado:'consultado',dados:{cnpj,razaoSocial:r.nome.slice(0,200),origem:'Hub do Desenvolvedor',candidatos:deduplicar(candidatos)}};
}
/** Consulta paga padrão: não força Receita nem adiciona consultas de IE. */
export class HubConsultaEmpresa implements ConsultaEmpresa {
 constructor(private token: string, private requisitar: typeof fetch = fetch) {}

 async consultar(cnpj: string): Promise<ResultadoConsulta<EmpresaConsultada>> {
  const indisponivel = (): ResultadoConsulta<EmpresaConsultada> => ({
   estado: 'indisponivel', codigo: 'HUB_CNPJ_CONSULTA_INDISPONIVEL'
  });
  if (!this.token || !/^\d{14}$/.test(cnpj)) return indisponivel();
  try {
   const url = new URL('https://ws.hubdodesenvolvedor.com.br/v2/cnpj/');
   url.searchParams.set('cnpj', cnpj);
   url.searchParams.set('token', this.token);
   const resposta = await this.requisitar(url, {
    method: 'GET', headers: { Accept: 'application/json' },
    redirect: 'error', signal: AbortSignal.timeout(300_000)
   });
   if (!resposta.ok) return indisponivel();
   const resultado = lerRespostaHubCnpj(await resposta.json(), cnpj);
   return resultado.estado === 'consultado' ? resultado : indisponivel();
  } catch {
   // Erros de transporte podem conter URL com documento/token: não propagá-los.
   return indisponivel();
  }
 }
}

/** O Hub só é usado quando configurado; indisponibilidade permite a fonte secundária. */
export function criarConsultaEmpresa(token?: string, requisitar: typeof fetch = fetch): ConsultaEmpresa {
 const secundaria = new BrasilApiConsultaEmpresa(requisitar);
 if (!token) return secundaria;
 const principal = new HubConsultaEmpresa(token, requisitar);
 return {
  async consultar(cnpj) {
   const resultado = await principal.consultar(cnpj);
   if (resultado.estado === 'consultado') return resultado;
   const alternativa = await secundaria.consultar(cnpj);
   return alternativa.estado === 'consultado' ? alternativa : resultado;
  }
 };
}
export class PesquisaRegistroIndisponivel implements ConsultaRegistro {
 async buscar(_nome:string,_uf?:string):Promise<ResultadoConsulta<DadosMedicoOnline[]>>{return {estado:'indisponivel',codigo:'CRM_FONTE_NAO_CONFIGURADA'};}
}
