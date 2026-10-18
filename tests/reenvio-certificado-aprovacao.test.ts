import { describe, expect, it } from 'vitest';
import type pg from 'pg';
import { PostgresCadastro, type TrabalhoCadastro } from '../src/cadastro/postgres-cadastro.js';
import { temAprovacaoProfissional } from '../src/cadastro/revisao-painel.js';

const medicoId='medico-1';
const certificadoId='certificado-novo';
const documento='12345678901';
const perfil={nome:'Maria Silva Souza',crm:'12345/SP',rqe:'321'};
const aprovacao={...perfil,confirmadoEm:'2026-10-18T10:00:00.000Z'};

// O banco aplica leituras/escritas; a decisão de reaproveitar aprovação fica no repositório real.
function banco(anteriores:TrabalhoCadastro[],perfilAtual=perfil,preexistente=false){
 const trabalhos=structuredClone(anteriores);
 const novo=():TrabalhoCadastro=>({id:'trabalho-novo',medico_id:medicoId,certificado_id:certificadoId,
  documento_titular:null,estado:'pendente',dados:{},snapshot:{nome:perfilAtual.nome,crm:perfilAtual.crm},tentativas:0});
 if(preexistente)trabalhos.push(novo());
 const query=async(sql:string,valores:unknown[]=[])=>{
  const texto=sql.replace(/\s+/g,' ').trim().toLowerCase();
  if(['begin','commit','rollback'].includes(texto))return {rows:[]};
  if(texto.startsWith('insert into cadastro_certificado_trabalhos')){
   if(!trabalhos.some(t=>t.certificado_id===certificadoId))trabalhos.push({...novo(),documento_titular:valores[2] as string??null});
   return {rows:trabalhos.filter(t=>t.certificado_id===certificadoId)};
  }
  if(texto.startsWith('select')&&texto.includes('from medicos'))return {rows:[{id:medicoId,nome_completo:perfilAtual.nome,...perfilAtual}]};
  if(texto.startsWith('select')&&texto.includes('from cadastro_certificado_trabalhos'))return {rows:structuredClone(trabalhos)};
  if(texto.startsWith('update cadastro_certificado_trabalhos')){
   const t=trabalhos.find(t=>t.id===valores[0]);
   if(!t)throw Error('Trabalho da atualização não encontrado');
   if(texto.includes("estado='concluido'"))t.estado='concluido';
   for(let i=1;i<valores.length;i++){
    const valor=valores[i];
    if(typeof valor==='string'&&valor.startsWith('{')){
     const objeto=JSON.parse(valor);
     if('aprovacaoPainel' in objeto)t.dados=objeto;
     else if('nome' in objeto)t.snapshot=objeto;
    }
   }
   if(texto.includes('documento_titular=$3'))t.documento_titular=valores[2] as string;
   return {rows:[t]};
  }
  throw Error('Consulta não implementada no banco do teste: '+sql);
 };
 const pool={query,connect:async()=>({query,release(){}})} as unknown as pg.Pool;
 return {repo:new PostgresCadastro(pool),trabalhos,atual:()=>trabalhos.find(t=>t.certificado_id===certificadoId)!};
}
function anterior(alteracoes:Partial<TrabalhoCadastro>={}):TrabalhoCadastro{
 return {id:'trabalho-anterior',medico_id:medicoId,certificado_id:'certificado-anterior',documento_titular:documento,
  estado:'concluido',dados:{nomeConfirmado:perfil.nome,aprovacaoPainel:aprovacao},snapshot:{nome:perfil.nome,crm:perfil.crm},tentativas:1,...alteracoes};
}

describe('reenvio A1 e aprovação profissional',()=>{
 it.each([false,true])('preserva aprovação imediatamente para mesmo titular e perfil (trabalho já criado pelo worker: %s)',async preexistente=>{
  const db=banco([anterior()],perfil,preexistente);
  await db.repo.agendar({medicoId,certificadoId,documentoTitular:documento});
  expect(temAprovacaoProfissional(db.atual(),perfil)).toBe(true);
  expect(db.atual().dados.aprovacaoPainel).toEqual(aprovacao);
  expect(db.atual().documento_titular).toBe(documento);
  expect(db.trabalhos).toHaveLength(2);
 });
 it.each(['98765432100',undefined])('exige titular conhecido e igual: %s',async documentoTitular=>{
  const db=banco([anterior()]);
  await db.repo.agendar({medicoId,certificadoId,documentoTitular});
  expect(temAprovacaoProfissional(db.atual(),perfil)).toBe(false);
  expect(db.atual().dados.aprovacaoPainel).toBeUndefined();
 });
 it.each([{nome:'Ana Silva Souza'},{crm:'99999/RJ'},{rqe:'999'}])('exige perfil aprovado ainda igual: %j',async alteracao=>{
  const perfilAtual={...perfil,...alteracao};
  const db=banco([anterior()],perfilAtual);
  await db.repo.agendar({medicoId,certificadoId,documentoTitular:documento});
  expect(temAprovacaoProfissional(db.atual(),perfilAtual)).toBe(false);
  expect(db.atual().dados.aprovacaoPainel).toBeUndefined();
 });
 it.each([
  {medico_id:'outro-medico'},
  {documento_titular:null},
  {estado:'aguardando_confirmacao'},
  {dados:{nomeConfirmado:perfil.nome}},
  {dados:{aprovacaoPainel:{...aprovacao,confirmadoEm:''}}}
 ] satisfies Partial<TrabalhoCadastro>[])('não reaproveita origem sem identidade e aprovação válidas: %j',async alteracoes=>{
  const db=banco([anterior(alteracoes)]);
  await db.repo.agendar({medicoId,certificadoId,documentoTitular:documento});
  expect(temAprovacaoProfissional(db.atual(),perfil)).toBe(false);
  expect(db.atual().dados.aprovacaoPainel).toBeUndefined();
 });
});
