import assert from 'node:assert/strict';
import { test } from 'node:test';
import type pg from 'pg';
import { gerarHashCpf } from '../../paciente/hash-cpf.js';
import type { PacientePlanilha } from './types.js';

// The only external dependency is PostgreSQL. This fake enforces ownership,
// unique phone inserts and fixed parameterized mutations at that boundary.
type Registro = {id:string;medico_id:string;telefone:string;nome:string|null;nome_validado:boolean;email:string|null;cpf_cnpj_hash:string|null;cpf_cnpj_encriptado:string|null};
const hash = gerarHashCpf('52998224725', 'pepper');
function banco(iniciais: Partial<Registro>[] = [], concorrente?: Partial<Registro>) {
  const registros: Registro[] = iniciais.map((r,i)=>({id:String(i),medico_id:'medico',telefone:'5511999999999',nome:null,nome_validado:false,email:null,cpf_cnpj_hash:null,cpf_cnpj_encriptado:null,...r}));
  const consultas: Array<{sql:string;valores:unknown[]}> = [];
  const query = async (sql:string, valores:unknown[] = []) => {
    consultas.push({sql,valores});
    if (sql.includes('pg_advisory_xact_lock')) return {rows:[]};
    if (/^\s*select /i.test(sql)) return {rows:registros.filter(r=>r.medico_id===valores[0] && (r.telefone===valores[1] || (valores[2] && r.cpf_cnpj_hash===valores[2]))).map(r=>({...r}))};
    if (/^\s*insert /i.test(sql)) {
      if (concorrente) { registros.push({id:'concorrente',medico_id:'medico',telefone:String(valores[1]),nome:null,nome_validado:false,email:null,cpf_cnpj_hash:null,cpf_cnpj_encriptado:null,...concorrente}); concorrente=undefined; }
      if (registros.some(r=>r.medico_id===valores[0] && r.telefone===valores[1])) return {rows:[]};
      const novo = {id:String(registros.length),medico_id:String(valores[0]),telefone:String(valores[1]),nome:valores[2] as string|null,email:valores[3] as string|null,cpf_cnpj_hash:valores[4] as string|null,cpf_cnpj_encriptado:valores[5] ? 'encrypted' : null,nome_validado:false};
      registros.push(novo); return {rows:[{...novo}]};
    }
    if (/^\s*update pacientes/i.test(sql)) {
      const r = registros.find(r=>r.id===valores[0] && r.medico_id===valores[1]);
      assert.ok(r, 'update must be scoped to the physician');
      if (!r.nome?.trim() && !r.nome_validado) r.nome=valores[2] as string|null;
      if (!r.email?.trim()) r.email=valores[3] as string|null;
      if (!r.cpf_cnpj_hash) r.cpf_cnpj_hash=valores[4] as string|null;
      if (!r.cpf_cnpj_encriptado && valores[5]) r.cpf_cnpj_encriptado='encrypted';
      return {rows:[{...r}]};
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  return {client:{query} as unknown as pg.PoolClient,registros,consultas};
}
const paciente = (overrides: Partial<PacientePlanilha> = {}):PacientePlanilha => ({linha:2,nome:'José Silva',cpf:'52998224725',email:null,telefone:'5511999999999',pendencias:[],...overrides});
async function importar(db:ReturnType<typeof banco>, pacientes:PacientePlanilha[]) {
  const { importarPacientesPlanilha } = await import('./importar-pacientes.js');
  return importarPacientesPlanilha(db.client,'medico',pacientes,'chave','pepper');
}

test('cria uma vez e reconhece duplicata no lote', async()=>{
  const db=banco(); const r=await importar(db,[paciente(),paciente({linha:3})]);
  assert.equal(r.criados,1); assert.equal(r.semAlteracao,1); assert.equal(db.registros.length,1);
  assert.equal(db.registros[0].nome_validado,false); assert.equal(db.registros[0].cpf_cnpj_encriptado,'encrypted');
});
test('CPF em outro telefone ou telefone com outro CPF não altera cadastro', async()=>{
  for (const existente of [{telefone:'5511888888888',cpf_cnpj_hash:hash},{cpf_cnpj_hash:'outro-cpf'}]) {
    const db=banco([existente]); const antes=structuredClone(db.registros);
    const r=await importar(db,[paciente()]);
    assert.equal(r.ignorados[0]?.linha,2); assert.deepEqual(db.registros,antes);
  }
});
test('preserva nome validado e completa email sem alterar grafia', async()=>{
  const db=banco([{nome:'JOSÉ SILVA',nome_validado:true,cpf_cnpj_hash:hash,cpf_cnpj_encriptado:'encrypted'}]);
  const r=await importar(db,[paciente({nome:'Jose Silva',email:'jose@example.com'})]);
  assert.equal(r.completados,1); assert.equal(db.registros[0].nome,'JOSÉ SILVA'); assert.equal(db.registros[0].nome_validado,true); assert.equal(db.registros[0].email,'jose@example.com');
});
test('nome ou email incompatível ignora toda a linha',async()=>{
  for (const existente of [{nome:'Maria Silva'},{email:'outra@example.com'}]) {
    const db=banco([existente]); const antes=structuredClone(db.registros);
    const r=await importar(db,[paciente({email:'jose@example.com'})]);
    assert.equal(r.ignorados.length,1); assert.deepEqual(db.registros,antes);
  }
});
test('não usa CPF nem telefone pertencentes a outro médico',async()=>{
  const db=banco([{medico_id:'outro',nome:'Maria Silva',cpf_cnpj_hash:hash}]);
  const r=await importar(db,[paciente()]);
  assert.equal(r.criados,1); assert.equal(db.registros[0].nome,'Maria Silva'); assert.equal(db.registros[1].medico_id,'medico');
});
test('revalida entrada sem confiar em pendências fornecidas',async()=>{
  const db=banco(); const r=await importar(db,[paciente({telefone:null}),paciente({telefone:'+5511999999999'}),paciente({cpf:'11111111111'}),paciente({nome:'PACIENTE'}),paciente({email:'invalido'}),paciente({pendencias:['erro']})]);
  assert.equal(r.ignorados.length,6); assert.equal(db.registros.length,0);
});
test('conflito de inserção concorrente é relido sem sobrescrever CPF',async()=>{
  const db=banco([], {cpf_cnpj_hash:'outro-cpf',nome:'Maria Silva'});
  const r=await importar(db,[paciente()]);
  assert.equal(r.criados,0); assert.equal(r.ignorados.length,1); assert.equal(db.registros[0].cpf_cnpj_hash,'outro-cpf');
});
test('conteúdo da planilha é apenas parâmetro de SQL fixo',async()=>{
  const db=banco(); const nome="Ana Silva'; delete from medicos; --";
  await importar(db,[paciente({nome})]);
  assert.ok(db.consultas.every(q=>!q.sql.includes(nome)));
  assert.ok(db.consultas.some(q=>q.valores.includes(nome)));
  assert.ok(db.consultas.every(q=>!/solicitacoes|emissoes/i.test(q.sql)));
});
test('campos de tipo inesperado não são tratados como ausentes',async()=>{
  const db=banco();
  const r=await importar(db,[paciente({cpf:123 as unknown as string}),paciente({nome:{} as unknown as string}),paciente({email:[] as unknown as string})]);
  assert.equal(r.ignorados.length,3); assert.equal(db.registros.length,0);
});
test('cadastro mínimo aceita campos opcionais ausentes',async()=>{
  const db=banco(); const r=await importar(db,[paciente({nome:null,email:null,cpf:null})]);
  assert.equal(r.criados,1); assert.equal(db.registros[0].nome,null); assert.equal(db.registros[0].cpf_cnpj_encriptado,null);
});
test('CPF duplicado em dois cadastros nunca é resolvido por escolha arbitrária',async()=>{
  const db=banco([{cpf_cnpj_hash:hash},{telefone:'5511888888888',cpf_cnpj_hash:hash}]);
  const antes=structuredClone(db.registros); const r=await importar(db,[paciente()]);
  assert.equal(r.ignorados.length,1); assert.deepEqual(db.registros,antes);
});
test('inserção concorrente compatível completa lacunas em vez de contar criação',async()=>{
  const db=banco([], {nome:'José Silva'}); const r=await importar(db,[paciente({email:'jose@example.com'})]);
  assert.equal(r.criados,0); assert.equal(r.completados,1); assert.equal(db.registros[0].cpf_cnpj_hash,hash);
});
