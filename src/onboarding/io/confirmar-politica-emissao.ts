/** A confirmação prende a política ao serviço/perfil revisados na mesma transação. */
import type pg from 'pg';

import { parametrosEmissaoSchema } from '../../fiscal/preparacao/parametros-emissao.js';
import { validarReferenciaFiscal } from '../../fiscal/preparacao/validar-referencia-fiscal.js';
export async function confirmarPoliticaEmissao(pool: pg.Pool, input: { medicoId: string; referenciaHash?: string; parametrosEmissao?: unknown; opcaoSimplesNacional?: string; serieDps?: string; proximoNumeroDps?: number; razaoSocial?: string; especialidade?: string; aliquotaIss?: number }): Promise<void> {
  const parametros = parametrosEmissaoSchema.parse(input.parametrosEmissao);
  if (input.opcaoSimplesNacional && input.opcaoSimplesNacional !== parametros.opcaoSimplesNacional) throw new Error('Regimes informados divergem.');
  const client = await pool.connect();
  try {
    await client.query('begin');
    const perfil = await client.query(`select cod_municipio_ibge, serie_dps, xml_nota_referencia_url, dados_reforma_tributaria
      from medico_perfil_fiscal where medico_id = $1 for update`, [input.medicoId]);
    const servicos = await client.query(`select id, ctrib_nac, cnbs, ctrib_mun, parametros_emissao from medico_servicos_fiscais
      where medico_id = $1 and padrao and ativo for update`, [input.medicoId]);
    if (perfil.rows.length !== 1 || servicos.rows.length !== 1) throw new Error('É necessário um perfil e um único serviço padrão ativo.');
    const p = perfil.rows[0], s = servicos.rows[0];
    const pendencias = validarReferenciaFiscal(p.dados_reforma_tributaria, { referenciaHash: input.referenciaHash, parametros });
    if (pendencias.length) throw new Error(pendencias.join(' '));
    const serie = input.serieDps ?? p.serie_dps;
    if (!/^\d{1,5}$/.test(serie)) throw new Error('Série da DPS inválida.');
    if (input.proximoNumeroDps !== undefined && (!Number.isSafeInteger(input.proximoNumeroDps) || input.proximoNumeroDps < 1)) throw new Error('Número da DPS inválido.');
    if (!/^\d{6}$/.test(s.ctrib_nac)) throw new Error('Código de tributação do serviço inválido.');
    await client.query(`update medico_perfil_fiscal set confirmado_pelo_medico = true,
      ambiente = $8, serie_dps = $2, proximo_numero_dps = coalesce($3, proximo_numero_dps),
      opcao_simples_nacional = $4, regime_apuracao_sn = $5, regime_especial_tributacao = $6,
      percentual_tot_trib_sn = coalesce($7, percentual_tot_trib_sn), atualizado_em = now()
      where medico_id = $1`, [input.medicoId, serie, input.proximoNumeroDps, parametros.opcaoSimplesNacional,
      parametros.regimeApuracaoSn ?? null, parametros.regimeEspecialTributacao, parametros.percentualTotTribSN, parametros.ambiente]);
    const politica = { parametros, referenciaHash: input.referenciaHash, confirmadoEm: new Date().toISOString(), origem: 'revisao_onboarding',
      ctribNac: s.ctrib_nac, cnbs: s.cnbs, ctribMun: s.ctrib_mun,
      perfil: { ambiente: parametros.ambiente, opcao: parametros.opcaoSimplesNacional, regime: parametros.regimeApuracaoSn ?? null,
        especial: parametros.regimeEspecialTributacao, municipio: p.cod_municipio_ibge, serie,
        referencia: p.xml_nota_referencia_url } };
    await client.query(`update medico_servicos_fiscais set parametros_emissao = $3
      where id = $1 and medico_id = $2`, [s.id, input.medicoId, JSON.stringify(politica)]);
    await client.query(`insert into auditoria (acao, entidade, entidade_id, dados_anteriores, dados_novos)
      values ('confirmar_parametros_emissao', 'medico_servicos_fiscais', $1, $2, $3)`,
      [s.id, s.parametros_emissao ? JSON.stringify(s.parametros_emissao) : null, JSON.stringify(politica)]);
    if (input.especialidade) {
      await client.query(`update medicos set especialidade = $2, atualizado_em = now()
        where id = $1`, [input.medicoId, input.especialidade]);
    }
    if (input.razaoSocial) await client.query('update medico_perfil_fiscal set razao_social = $2 where medico_id = $1', [input.medicoId, input.razaoSocial]);
    if (input.aliquotaIss !== undefined) {
      if (!Number.isFinite(input.aliquotaIss) || input.aliquotaIss < 0 || input.aliquotaIss > 100) throw new Error('Alíquota inválida.');
      await client.query('update medico_servicos_fiscais set aliquota_iss = $2 where id = $1', [s.id, input.aliquotaIss]);
    }
    await client.query('commit');
  } catch (erro) { await client.query('rollback'); throw erro; }
  finally { client.release(); }
}
