import { z } from 'zod';
import { nomeProfissionalValido, normalizarCrm } from '../conta/validar-dados-emissao.js';
import type { PendenciaCadastro } from './enriquecer-cadastro.js';
export const decisaoConfirmacaoSchema=z.object({acao:z.enum(['confirmar_candidato','informar_nome','informar_crm','esclarecer']),candidatoId:z.string().optional(),valor:z.string().max(200).optional(),evidencia:z.string().max(2000).optional()}).strict();
export type DecisaoConfirmacao=z.infer<typeof decisaoConfirmacaoSchema>;
export type PatchConfirmacao={nome?:string;crm?:string};
const normal=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().replace(/\s+/g,' ').trim();
function crmComUf(s:string):string|null{const r=normalizarCrm(s.replace(/\b\d{1,3}(?:\.\d{3})+\b/g,v=>v.replace(/\./g,'')));return r?.includes('/')?r:null;}
function nomeAfirmado(texto:string,nome:string):boolean {
 const valor=normal(nome),n=normal(texto).replace(/[.!]$/,'');
 const titulo='(?:medic[oa]|doutor[a]?|dr[a]?\\.?|responsavel)';
 const escapado=valor.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const declaracao=new RegExp(`^(?:(?:a |o )?${titulo}(?: responsavel)?(?: e| se chama| chama-se|:) +${escapado}|${escapado} e (?:a |o )?${titulo}(?: responsavel)?)$`);
 return n===valor || n.split(/[;,\n]/).some(f=>declaracao.test(f.trim()));
}
/** Cada número aponta para o candidato que realmente apareceu naquela posição na pergunta. */
export function mapearEscolhas(p:PendenciaCadastro,pergunta:string):Record<string,string>{
 const marcadores=[...pergunta.matchAll(/\b(\d{1,2})[.)\-:]\s+/g)];
 const mapa:Record<string,string>={};
 for(let i=0;i<marcadores.length;i++){
  const item=marcadores[i],segmento=normal(pergunta.slice(item.index!+item[0].length,marcadores[i+1]?.index));
  const candidatos=p.candidatos.filter(c=>p.tipo==='crm'
   ?!!c.crm&&!!c.uf&&!!segmento.match(new RegExp('\\b'+c.uf.toLowerCase()+'\\b'))&&Array.from(segmento.matchAll(/\d+/g),m=>m[0]).includes(c.crm.replace(/\D/g,''))
   :segmento.startsWith(normal(c.nome)));
  if(candidatos.length!==1||mapa[item[1]]||Object.values(mapa).includes(candidatos[0].id))return {};
  mapa[item[1]]=candidatos[0].id;
 }
 return mapa;
}
const ordinais:Record<string,string>={primeiro:'1',primeira:'1',segundo:'2',segunda:'2',terceiro:'3',terceira:'3',quarto:'4',quarta:'4',quinto:'5',quinta:'5'};
/** IA escolhe interpretação; evidência, contexto e valores continuam validados no servidor. */
export function validarConfirmacao(p:PendenciaCadastro,d:DecisaoConfirmacao,texto:string):PatchConfirmacao|null{
 if(!p.perguntaConfirmada||texto.length>2000||!d.evidencia||!normal(texto).includes(normal(d.evidencia)))return null;
 const n=normal(texto);
 if(/[?]/.test(n)||/\b(nao|talvez|exemplo|hipotetico|acho que|nao sei)\b/.test(n))return null;
 if(d.acao==='confirmar_candidato'){
  const c=p.candidatos.find(c=>c.id===d.candidatoId);if(!c)return null;
  const escolha=n.replace(/^(?:a |o |opcao |numero |e a |e o )/,'').replace(/[.!]$/,'');
  const numero=ordinais[escolha]||(/^\d{1,2}$/.test(escolha)?escolha:null);
  const escolhidoPorIndice=numero&&mapearEscolhas(p,p.perguntaConfirmada)[numero]===c.id;
  const nomeUnico=p.tipo==='responsavel'&&p.candidatos.filter(outro=>normal(outro.nome)===normal(c.nome)).length===1&&nomeAfirmado(texto,c.nome);
  const crmExplicito=p.tipo==='crm'&&c.crm&&c.uf&&crmComUf(d.evidencia)===crmComUf(`${c.crm}/${c.uf}`);
  const escolhido=nomeUnico || crmExplicito || escolhidoPorIndice;
  const afirmativo=/^(?:sim|sou eu|e ela|e ele|isso(?: mesmo)?|correto|esta correto|pode seguir|pode prosseguir|confirmo|confirmado)[.!]?$/.test(n);
  if(!escolhido && !(p.candidatos.length===1&&afirmativo))return null;
  if(p.tipo==='responsavel')return {nome:c.nome};
  if(p.tipo==='crm'&&c.crm&&c.uf){const crm=crmComUf(`${c.crm}/${c.uf}`);return crm?{crm}:null;}
  return null;
 }
 if(d.acao==='informar_nome' && p.tipo!=='crm' && d.valor && nomeProfissionalValido(d.valor) && normal(d.evidencia).includes(normal(d.valor))){
  if(!nomeAfirmado(texto,d.valor) || /\b(estou|estamos|verificando|verificar|medic[oa]|doutor[a]?|responsavel|tudo|certo|confirmado|confirmo|pode|sou|seguir|prosseguir)\b/.test(normal(d.valor)))return null;
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
