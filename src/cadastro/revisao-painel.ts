import { z } from 'zod';
import { nomeProfissionalValido, normalizarCrm } from '../conta/validar-dados-emissao.js';
import type { DadosCadastro } from './enriquecer-cadastro.js';

const nome = z.string().trim().min(2).max(200).refine(nomeProfissionalValido, 'Informe o nome completo do médico.');
export const aprovacaoPainelSchema = z.object({
 trabalhoId: z.string().uuid(), versao: z.string().min(1).max(200), nome,
 crm: z.string().trim().max(60).transform(s => normalizarCrm(s.replace(/\b\d{1,3}(?:\.\d{3})+\b/g,v=>v.replace(/\./g,''))))
  .refine((s):s is string => !!s?.includes('/'), 'Informe CRM com UF, como 37341/RS.'),
 rqe: z.string().trim().max(60).regex(/^\d*$/, 'Informe apenas números no RQE.').nullable().transform(s=>s||null)
}).strict();
export class ErroRevisaoCadastro extends Error {
 constructor(readonly status:number, mensagem:string){super(mensagem);}
}
type TrabalhoRevisao={id:string;estado:string;dados:DadosCadastro;versao?:string;atualizado_em?:unknown};
type PerfilRevisao={nome:string;crm:string|null;rqe:string|null};
const normal=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').trim().toLocaleLowerCase('pt-BR');
export function montarRevisao(t:TrabalhoRevisao|null,perfil:PerfilRevisao){
 const dados=t?.dados??{};
 const candidatos=dados.empresa?.candidatos??[];
 const nome=dados.nomeConfirmado||(candidatos.length===1?candidatos[0].nome:nomeProfissionalValido(perfil.nome)?perfil.nome:'');
 const registros=(dados.pesquisaProfissional?.registros??[]).filter(r=>normal(r.nomeCompleto)===normal(nome)&&normalizarCrm(`${r.crm}/${r.uf}`)?.includes('/'));
 const unicos=[...new Map(registros.map(r=>[normalizarCrm(`${r.crm}/${r.uf}`),r])).values()];
 const crm=(normal(nome)===normal(perfil.nome)?normalizarCrm(perfil.crm):null)||(unicos.length===1?normalizarCrm(`${unicos[0].crm}/${unicos[0].uf}`):null);
 const registroEscolhido=unicos.find(r=>normalizarCrm(`${r.crm}/${r.uf}`)===crm);
 return {trabalhoId:t?.id??null,versao:t?.versao??null,estado:t?.estado??'sem_certificado',
  aprovado:t?.estado==='concluido'&&!!dados.aprovacaoPainel&&dados.aprovacaoPainel.nome===perfil.nome&&dados.aprovacaoPainel.crm===perfil.crm&&dados.aprovacaoPainel.rqe===perfil.rqe,
  nome,crm:crm??'',rqe:(normal(nome)===normal(perfil.nome)?perfil.rqe:null)??registroEscolhido?.rqe??'',candidatos,registros:unicos,
  pesquisaCrm:dados.pesquisaProfissional?.estado??'pendente',
  empresa:dados.empresa?{cnpj:dados.empresa.cnpj,razaoSocial:dados.empresa.razaoSocial,origem:dados.empresa.origem}:null};
}
