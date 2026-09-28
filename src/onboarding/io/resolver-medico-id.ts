/**
 * Resolução resiliente do identificador de médico (medicos.id).
 * Garante que requisições vindas do frontend com usuario_id ou medico_id
 * sempre apontem para um registro válido na tabela `medicos`, evitando
 * violações de chave estrangeira em `medico_perfil_fiscal` e `medico_certificados`.
 */

import type pg from 'pg';

export async function resolverMedicoId(
  pool: pg.Pool,
  idOuUsuarioId: string
): Promise<string> {
  if (!idOuUsuarioId || typeof idOuUsuarioId !== 'string') {
    throw new Error('Identificador de médico ou usuário não fornecido.');
  }

  // 1. Verifica se já é o ID primário da tabela medicos
  const sqlMedico = `select id from medicos where id = $1 limit 1`;
  const resMedico = await pool.query(sqlMedico, [idOuUsuarioId]);
  if (resMedico.rows.length > 0) {
    return resMedico.rows[0].id;
  }

  // 2. Verifica se é um usuario_id vinculado a um registro existente em medicos
  const sqlPorUsuario = `select id from medicos where usuario_id = $1 limit 1`;
  const resPorUsuario = await pool.query(sqlPorUsuario, [idOuUsuarioId]);
  if (resPorUsuario.rows.length > 0) {
    return resPorUsuario.rows[0].id;
  }

  // 3. Se for um usuario_id válido sem registro em medicos, cria o médico automaticamente
  const sqlUsuario = `select id, conta_id, nome from usuarios where id = $1 limit 1`;
  const resUsuario = await pool.query(sqlUsuario, [idOuUsuarioId]);
  if (resUsuario.rows.length > 0) {
    const u = resUsuario.rows[0];
    const sqlCriar = `
      insert into medicos (usuario_id, conta_id, nome_completo)
      values ($1, $2, $3)
      returning id
    `;
    const resCriar = await pool.query(sqlCriar, [u.id, u.conta_id, u.nome || 'Médico']);
    return resCriar.rows[0].id;
  }

  throw new Error(`Médico não encontrado para o identificador "${idOuUsuarioId}".`);
}
