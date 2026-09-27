/**
 * Confirmação dos parâmetros fiscais pelo médico após revisão do XML.
 * Atualiza razão social, alíquota ISS, série DPS e marca
 * `confirmado_pelo_medico = true`, liberando a emissão real (seção 1 e 5 do plano).
 */

import type pg from 'pg';

export type ConfirmarParametrosInput = {
  medicoId: string;
  razaoSocial?: string;
  especialidade?: string;
  aliquotaIss?: number;
  serieDps?: string;
  proximoNumeroDps?: number;
};

export async function confirmarParametrosFiscais(
  pool: pg.Pool,
  input: ConfirmarParametrosInput
): Promise<void> {
  const { medicoId, razaoSocial, especialidade, aliquotaIss, serieDps, proximoNumeroDps } = input;

  const sqlPerfil = `
    update medico_perfil_fiscal
    set confirmado_pelo_medico = true,
        razao_social = coalesce($2, razao_social),
        serie_dps = coalesce($3, serie_dps),
        proximo_numero_dps = coalesce($4, proximo_numero_dps),
        atualizado_em = now()
    where medico_id = $1
  `;
  await pool.query(sqlPerfil, [medicoId, razaoSocial, serieDps, proximoNumeroDps]);

  if (aliquotaIss !== undefined) {
    const sqlServico = `
      update medico_servicos_fiscais
      set aliquota_iss = $2
      where medico_id = $1 and padrao = true
    `;
    await pool.query(sqlServico, [medicoId, aliquotaIss]);
  }

  if (especialidade || razaoSocial) {
    const sqlMedico = `
      update medicos
      set especialidade = coalesce($2, especialidade),
          nome_completo = coalesce($3, nome_completo),
          atualizado_em = now()
      where id = $1
    `;
    await pool.query(sqlMedico, [medicoId, especialidade, razaoSocial]);
  }
}
