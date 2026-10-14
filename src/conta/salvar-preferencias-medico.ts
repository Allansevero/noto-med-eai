/**
 * Persistência e validação das preferências de emissão e comunicação do médico.
 * Permite ao médico alternar se a solicitação de CPF quando ausente deve ir
 * diretamente para o paciente (switch ativado) ou para o médico via WhatsApp (padrão).
 */

import type pg from 'pg';

export interface PreferenciasMedicoInput {
  medicoId: string;
  solicitarCpfDiretoPaciente: boolean;
}

export interface PreferenciasMedicoResultado {
  medicoId: string;
  solicitarCpfDiretoPaciente: boolean;
}

export async function salvarPreferenciasMedico(
  pool: pg.Pool,
  input: PreferenciasMedicoInput
): Promise<PreferenciasMedicoResultado> {
  if (!input.medicoId) {
    throw new Error('Médico não informado.');
  }

  const solicitarDireto = Boolean(input.solicitarCpfDiretoPaciente);

  const sql = `
    update medicos
    set solicitar_cpf_direto_paciente = $1,
        atualizado_em = now()
    where id = $2
    returning id, solicitar_cpf_direto_paciente
  `;

  const { rows } = await pool.query(sql, [solicitarDireto, input.medicoId]);
  if (rows.length === 0) {
    throw new Error(`Médico ${input.medicoId} não encontrado.`);
  }

  return {
    medicoId: rows[0].id,
    solicitarCpfDiretoPaciente: Boolean(rows[0].solicitar_cpf_direto_paciente)
  };
}
