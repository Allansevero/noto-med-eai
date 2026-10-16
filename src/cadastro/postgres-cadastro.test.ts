import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresCadastro } from './postgres-cadastro.js';

const medicoId = '00000000-0000-4000-8000-000000000001';
const trabalhoId = '00000000-0000-4000-8000-000000000002';
const certificadoId = '00000000-0000-4000-8000-000000000003';
const entrada = { trabalhoId, versao: 'versao-atual', nome: 'Ana de Souza', crm: '37341/RS', rqe: null };

function repositorio(estado: string, opcoes: { ativo?: boolean; certificado?: string; versao?: string } = {}) {
 const comandos: { sql: string; parametros: any[] }[] = [];
 const trabalho = { id: trabalhoId, medico_id: medicoId, certificado_id: certificadoId, estado, dados: {}, snapshot: { nome: 'Médico provisório', crm: null } };
 const perfil = { nome_completo: 'Médico provisório', crm: null, rqe: null };
 const cliente = { release() {}, async query(sql: string, parametros: any[] = []) {
  comandos.push({ sql, parametros });
  if (sql.startsWith('select * from cadastro_certificado_trabalhos')) return { rows: [trabalho] };
  if (sql.startsWith('select nome_completo,crm,rqe')) return { rows: [perfil] };
  if (sql.startsWith('select id from medico_certificados')) return { rows: [{ id: opcoes.certificado ?? certificadoId }] };
  if (sql.startsWith('select u.ativo')) return { rows: [{ ativo: opcoes.ativo ?? true }] };
  if (sql.startsWith('select md5(')) return { rows: [{ versao: opcoes.versao ?? entrada.versao }] };
  return { rows: [] };
 } };
 const pool: any = { connect: async () => cliente, async query() { return { rows: [{ nome: entrada.nome, crm: entrada.crm, rqe: null,
  trabalho: { ...trabalho, estado: 'concluido', dados: { aprovacaoPainel: { ...entrada, confirmadoEm: '2026-10-16' } } }, versao: 'nova', whatsapp_conectado: false }] }; } };
 return { repo: new PostgresCadastro(pool), comandos };
}

for (const estado of ['pendente', 'consultando', 'aguardando_confirmacao', 'concluido']) {
 test(`aprovação manual de trabalho ${estado} independe de WhatsApp e cancela reserva`, async () => {
  const { repo, comandos } = repositorio(estado);
  const resultado = await repo.aprovarPainel(medicoId, entrada);
  assert.equal(resultado.aprovado, true);
  assert.equal(resultado.whatsappConectado, false);
  assert.equal(comandos.some(c => c.sql.includes('whatsapp_instancias')), false);
  assert.match(comandos[1].sql, /for update/);
  const alteracao = comandos.find(c => c.sql.startsWith('update cadastro_certificado_trabalhos'))!;
  assert.match(alteracao.sql, /reserva=null,reservado_em=null/);
  assert.match(alteracao.sql, /estado='concluido'/);
  const dados = JSON.parse(alteracao.parametros[1]);
  assert.equal(dados.aprovacaoPainel.nome, entrada.nome);
  assert.equal(dados.aprovacaoPainel.crm, entrada.crm);
  assert.ok(dados.aprovacaoPainel.confirmadoEm);
 });
}

for (const [caso, estado, opcoes] of [
 ['usuário inativo', 'pendente', { ativo: false }],
 ['certificado substituído', 'consultando', { certificado: 'outro' }],
 ['versão obsoleta', 'consultando', { versao: 'outra' }],
 ['trabalho obsoleto', 'obsoleto', {}]
] as const) {
 test(`aprovação rejeita ${caso} sem alterar dados`, async () => {
  const { repo, comandos } = repositorio(estado, opcoes);
  await assert.rejects(() => repo.aprovarPainel(medicoId, entrada), { status: 409 });
  assert.equal(comandos.some(c => c.sql.startsWith('update ')), false);
  assert.equal(comandos.at(-1)?.sql, 'rollback');
 });
}
