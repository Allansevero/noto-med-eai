/**
 * Persistência do serviço fiscal padrão inicial na tabela `medico_servicos_fiscais`.
 * Grava cTribNac, cTribMun (seção 5.1), Nomenclatura Brasileira de Serviços (cNBS)
 * e alíquota de ISS com flag padrao = true para o médico (seção 1 e 3 do plano).
 */

import type pg from 'pg';
import type { ServicoFiscalExtraido } from '../regras/mapear-servico-fiscal-do-xml.js';

export async function salvarServicoFiscalPadrao(
  pool: Pick<pg.Pool, 'query'>,
  medicoId: string,
  servico: ServicoFiscalExtraido
): Promise<void> {
  await pool.query(`update medico_servicos_fiscais set padrao = false
    where medico_id = $1 and padrao = true and nome_servico <> $2`, [medicoId, servico.nomeServico]);
  const sql = `
    insert into medico_servicos_fiscais (
      medico_id, nome_servico, ctrib_nac, ctrib_mun, cnbs,
      xdesc_serv, valor_padrao_centavos, aliquota_iss, padrao, ativo
    ) values (
      $1, $2, $3, $4, $5,
      $6, $7, $8, true, true
    )
    on conflict (medico_id, nome_servico) do update set
      ctrib_nac = excluded.ctrib_nac,
      ctrib_mun = excluded.ctrib_mun,
      cnbs = excluded.cnbs,
      xdesc_serv = excluded.xdesc_serv,
      valor_padrao_centavos = excluded.valor_padrao_centavos,
      aliquota_iss = excluded.aliquota_iss,
      parametros_emissao = null,
      padrao = true,
      ativo = true;
  `;

  await pool.query(sql, [
    medicoId,
    servico.nomeServico,
    servico.ctribNac,
    servico.ctribMun,
    servico.cnbs,
    servico.xdescServ,
    servico.valorPadraoCentavos,
    servico.aliquotaIss
  ]);

  if (servico.especialidadeSugerida) {
    const sqlEsp = `
      update medicos
      set especialidade = coalesce(nullif(especialidade, ''), $2)
      where id = $1
    `;
    await pool.query(sqlEsp, [medicoId, servico.especialidadeSugerida]);
  }
}
