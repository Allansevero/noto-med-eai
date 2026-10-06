/** Regressão do salvamento parcial e do caminho cadastro → descrição → XML. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salvarPerfilProfissional } from './salvar-perfil-profissional.js';
import { PostgresAtendimentoRepositorio } from './postgres-atendimento-repositorio.js';
import { montarDescricaoServico } from '../../emissao/montar-descricao-servico.js';
import { gerarXmlDps } from '../fiscal/gerar-xml-dps.js';

const medicoId = '11111111-1111-4111-8111-111111111111';
const usuarioId = '22222222-2222-4222-8222-222222222222';
function banco(opcoes: { falharUsuario?: boolean; semMedico?: boolean; semUpdate?: boolean } = {}) {
  let medico = { id: medicoId, usuario_id: usuarioId, nome_completo: 'Nome anterior',
    crm: '111/SP' as string | null, rqe: '222' as string | null };
  let nomeUsuario = medico.nome_completo;
  let anterior = { ...medico };
  const queries: string[] = [];
  let liberado = false;
  const client = { async query(sql: string, params: any[] = []) {
    queries.push(sql);
    if (sql === 'begin') anterior = { ...medico };
    if (sql === 'rollback') medico = { ...anterior };
    if (sql.startsWith('select id, usuario_id')) return { rows: opcoes.semMedico ? [] : [{ ...medico }] };
    if (sql.startsWith('update medicos')) {
      if (opcoes.semUpdate) return { rows: [] };
      medico.nome_completo = params[1] ?? medico.nome_completo;
      if (params[2]) medico.crm = params[3];
      if (params[4]) medico.rqe = params[5];
      return { rows: [{ medicoId, nome: medico.nome_completo, crm: medico.crm, rqe: medico.rqe }] };
    }
    if (sql.startsWith('update usuarios')) {
      if (opcoes.falharUsuario) throw new Error('Falha no banco');
      assert.equal(params[0], usuarioId);
      nomeUsuario = params[1] ?? nomeUsuario;
      return { rows: [{ id: usuarioId, email: params[2] ?? 'anterior@example.com' }] };
    }
    if (sql.includes('select m.id, m.nome_completo')) return { rows: [{ ...medico, especialidade: 'Cardiologia', ctrib_nac_padrao: '040101' }] };
    return { rows: [] };
  }, release() { liberado = true; } };
  return { pool: { connect: async () => client, query: client.query } as any,
    queries, medico: () => medico, nomeUsuario: () => nomeUsuario, liberado: () => liberado };
}

test('salva nome, CRM e RQE e usa os dados persistidos na descrição enviada no XML', async () => {
  const b = banco();
  const perfil = await salvarPerfilProfissional(b.pool, { medicoId, nome: '  Ana   Maria Silva  ', crm: ' 12345/SP ', rqe: ' 6789 ' });
  assert.deepEqual(perfil, { medicoId, nome: 'Ana Maria Silva', crm: '12345/SP', rqe: '6789' });
  assert.equal(b.nomeUsuario(), 'Ana Maria Silva');
  assert.equal(b.queries.at(-1), 'commit');
  assert.equal(b.liberado(), true);
  const medico = await new PostgresAtendimentoRepositorio(b.pool, 'chave-teste').buscarDadosMedico(medicoId);
  const descricao = montarDescricaoServico(medico!, '05/10/2026');
  const { xml } = gerarXmlDps({ nDPS: '1', tomador: { CPF: '12345678909', xNome: 'Paciente Exemplo' },
    xDescServ: descricao, vServ: 200, cTribNac: '040101', cNBS: '', cIndOp: '', cClassTrib: '' },
  { cnpj: '12345678000195', im: '', codMunicipio: '3550308', ambiente: 2, serie: '1',
    regTrib: { opSimpNac: 3, regApTribSN: 1, regEspTrib: 0 }, pTotTribSN: 6 });
  assert.ok(xml.includes(`<xDescServ>${descricao}</xDescServ>`));
  assert.ok(descricao.includes('ANA MARIA SILVA VINCULADO CRM 12345/SP / RQE 6789'));
});

test('editar um registro preserva os demais e permite remover RQE opcional', async () => {
  const b = banco();
  await salvarPerfilProfissional(b.pool, { medicoId, crm: '999/RS' });
  const perfil = await salvarPerfilProfissional(b.pool, { medicoId, rqe: '  ' });
  assert.equal(perfil.nome, 'Nome anterior');
  assert.equal(perfil.crm, '999/RS');
  assert.equal(perfil.rqe, null);
  assert.ok(!b.queries.some(sql => sql.startsWith('update usuarios')));
});

test('falha ao salvar usuário reverte a mudança do médico', async () => {
  const b = banco({ falharUsuario: true });
  await assert.rejects(() => salvarPerfilProfissional(b.pool, { medicoId, nome: 'Novo nome', crm: '999/RS' }), /Falha no banco/);
  assert.equal(b.medico().nome_completo, 'Nome anterior');
  assert.equal(b.medico().crm, '111/SP');
  assert.equal(b.queries.at(-1), 'rollback');
  assert.equal(b.liberado(), true);
});

test('não relata sucesso para médico inexistente ou nenhuma linha atualizada', async () => {
  for (const opcoes of [{ semMedico: true }, { semUpdate: true }]) {
    const b = banco(opcoes);
    await assert.rejects(() => salvarPerfilProfissional(b.pool, { medicoId, nome: 'Novo nome' }));
    assert.equal(b.queries.at(-1), 'rollback');
    assert.ok(!b.queries.includes('commit'));
  }
});

test('não altera o usuário de outro médico', async () => {
  const b = banco();
  await assert.rejects(() => salvarPerfilProfissional(b.pool, {
    medicoId, usuarioId: '33333333-3333-4333-8333-333333333333', nome: 'Novo nome'
  }), /não corresponde/);
  assert.ok(!b.queries.some(sql => sql.startsWith('update')));
});

test('rejeita nome vazio, tipo inválido, ausência de alterações e campos não permitidos antes de gravar', async () => {
  for (const alteracoes of [{ nome: ' ' }, { crm: 123 }, {}, { rqe: '1', aliquota: 0 }]) {
    const b = banco();
    await assert.rejects(() => salvarPerfilProfissional(b.pool, { medicoId, ...alteracoes }));
    assert.equal(b.queries.length, 0);
  }
});

test('salva email de contato normalizado sem alterar nome ou registros profissionais', async () => {
  const b = banco();
  const perfil = await salvarPerfilProfissional(b.pool, { medicoId, usuarioId, email: '  Medico@Example.com  ' });
  assert.equal(perfil.email, 'medico@example.com');
  assert.equal(b.nomeUsuario(), 'Nome anterior');
  assert.equal(perfil.crm, '111/SP');
  assert.equal(b.queries.at(-1), 'commit');
  const invalido = banco();
  await assert.rejects(() => salvarPerfilProfissional(invalido.pool, { medicoId, email: 'invalido' }));
  assert.equal(invalido.queries.length, 0);
});
