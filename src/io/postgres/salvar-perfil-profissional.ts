/**
 * Grava a identidade profissional e o nome do usuário vinculado na mesma
 * transação. Retorna os valores persistidos, sem sucesso parcial na conta.
 */
import type pg from 'pg';
import { perfilProfissionalSchema } from '../../conta/validar-perfil-profissional.js';

export class ErroPerfilProfissional extends Error {}

export async function salvarPerfilProfissional(pool: pg.Pool, entrada: unknown) {
  const dados = perfilProfissionalSchema.parse(entrada);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows: medicos } = await client.query(
      'select id, usuario_id from medicos where id = $1 for update', [dados.medicoId]);
    const medico = medicos[0];
    if (!medico) throw new ErroPerfilProfissional('Médico não encontrado. Atualize a página e tente novamente.');
    if (dados.usuarioId && dados.usuarioId !== medico.usuario_id) {
      throw new ErroPerfilProfissional('O usuário informado não corresponde ao médico.');
    }
    const { rows } = await client.query(`update medicos set
      nome_completo = coalesce($2, nome_completo),
      crm = case when $3 then $4 else crm end,
      rqe = case when $5 then $6 else rqe end,
      atualizado_em = now() where id = $1
      returning id as "medicoId", nome_completo as nome, crm, rqe`,
      [medico.id, dados.nome ?? null, dados.crm !== undefined, dados.crm ?? null,
        dados.rqe !== undefined, dados.rqe ?? null]);
    if (rows.length !== 1) throw new ErroPerfilProfissional('Não foi possível salvar os dados profissionais.');
    if (dados.nome !== undefined) {
      const usuario = await client.query(`update usuarios set nome = $2, atualizado_em = now()
        where id = $1 returning id`, [medico.usuario_id, dados.nome]);
      if (usuario.rows.length !== 1) throw new ErroPerfilProfissional('Não foi possível salvar o nome da conta.');
    }
    await client.query('commit');
    return rows[0] as { medicoId: string; nome: string; crm: string | null; rqe: string | null };
  } catch (erro) {
    await client.query('rollback');
    throw erro;
  } finally {
    client.release();
  }
}
