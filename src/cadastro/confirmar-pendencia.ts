import { z } from 'zod';
import { nomeProfissionalValido, normalizarCrm } from '../conta/validar-dados-emissao.js';
import type { PendenciaCadastro } from './enriquecer-cadastro.js';
export const decisaoConfirmacaoSchema=z.object({acao:z.enum(['confirmar_candidato','informar_nome','informar_crm','esclarecer']),candidatoId:z.string().optional(),valor:z.string().max(200).optional(),evidencia:z.string().max(2000).optional()}).strict();
export type DecisaoConfirmacao=z.infer<typeof decisaoConfirmacaoSchema>;
export type PatchConfirmacao={nome?:string;crm?:string};
const normal=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
function crmComUf(s:string):string|null{const r=normalizarCrm(s.replace(/\b\d{1,3}(?:\.\d{3})+\b/g,v=>v.replace(/\./g,'')));return r?.includes('/')?r:null;}
/** IA escolhe interpretação; evidência, contexto e valores continuam validados no servidor. */
export function validarConfirmacao(p:PendenciaCadastro,d:DecisaoConfirmacao,texto:string):PatchConfirmacao|null{
 if(!p.perguntaConfirmada||texto.length>2000||!d.evidencia||!normal(texto).includes(normal(d.evidencia)))return null;
 const n=normal(texto);
 if(/[?]/.test(n)||/\b(nao|talvez|exemplo|hipotetico|acho que|nao sei)\b/.test(n))return null;
 if(d.acao==='confirmar_candidato'){
  const c=p.candidatos.find(c=>c.id===d.candidatoId);if(!c)return null;
  const indice=p.candidatos.indexOf(c)+1;
  const ordinal=['primeir','segund','terceir'][indice-1];
  const nomeUnico=p.tipo==='responsavel'&&p.candidatos.filter(outro=>normal(outro.nome)===normal(c.nome)).length===1&&n.includes(normal(c.nome));
  const crmExplicito=p.tipo==='crm'&&c.crm&&c.uf&&crmComUf(d.evidencia)===crmComUf(`${c.crm}/${c.uf}`);
  const escolhido=nomeUnico || crmExplicito || (p.candidatos.length>1&&(new RegExp(`^(?:a |o |opcao |numero )?${indice}[.!]?$`).test(n)||(ordinal&&new RegExp(`^(?:a |o |e a |e o )?${ordinal}[ao][.!]?$`).test(n))));
  const afirmativo=/^(?:sim|sou eu|e ela|e ele|isso(?: mesmo)?|correto|esta correto|pode seguir|pode prosseguir|confirmo|confirmado)[.!]?$/.test(n);
  if(!escolhido && !(p.candidatos.length===1&&afirmativo))return null;
  if(p.tipo==='responsavel')return {nome:c.nome};
  if(p.tipo==='crm'&&c.crm&&c.uf){const crm=crmComUf(`${c.crm}/${c.uf}`);return crm?{crm}:null;}
  return null;
 }
 if(d.acao==='informar_nome' && p.tipo!=='crm' && d.valor && nomeProfissionalValido(d.valor) && normal(d.evidencia).includes(normal(d.valor))){
  // Nome do interlocutor nunca substitui o do profissional quando ele se identifica como secretário.
  if(/^(sou eu|pode seguir|pode prosseguir|isso mesmo|esta correto|e ela|e ele|confirmo)[.!]?$/.test(n))return null;
  if(/\b(secretari[oa]|assistente)\b/.test(n) || /^\s*(me chamo|meu nome|eu sou)\b/.test(n))return null;
  return {nome:d.valor.trim()};
 }
 if(d.acao==='informar_crm' && p.tipo==='crm'&&d.valor){
  const crm=crmComUf(d.valor),evidencia=crmComUf(d.evidencia);
  return crm&&crm===evidencia?{crm}:null;
 }
 return null;
}
