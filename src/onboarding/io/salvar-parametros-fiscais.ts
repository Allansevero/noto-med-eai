/**
 * Persistência no PostgreSQL dos parâmetros fiscais extraídos do XML de referência.
 * Utiliza pgp_sym_encrypt para criptografia simétrica do CNPJ/CPF em repouso
 * e grava extraido_automaticamente = true, confirmado_pelo_medico = false
 * para exigir validação antes da emissão real (seção 1 e 3 do plano).
 */

import type pg from 'pg';
import { gerarHashCpf } from '../../paciente/hash-cpf.js';
import type { ParametrosFiscaisExtraidos } from '../regras/mapear-parametros-fiscais-do-xml.js';

export type SalvarParametrosInput = {
  medicoId: string;
  params: ParametrosFiscaisExtraidos;
  xmlStorageUrl?: string | null;
  chaveCriptografia: string;
  pepperCpf: string;
};

export async function salvarParametrosFiscais(
  pool: pg.Pool,
  input: SalvarParametrosInput
): Promise<void> {
  const { medicoId, params, xmlStorageUrl, chaveCriptografia, pepperCpf } = input;
  const cpfCnpjHash = gerarHashCpf(params.cnpj, pepperCpf);
  const tipoPessoa = params.cnpj.length === 14 ? 'PJ' : 'PF';

  const sqlPerfil = `
    insert into medico_perfil_fiscal (
      medico_id, tipo_pessoa, cpf_cnpj_hash, cpf_cnpj_encriptado,
      razao_social, nome_fantasia, inscricao_municipal, uf,
      cod_municipio_ibge, serie_dps, opcao_simples_nacional,
      regime_apuracao_sn, regime_especial_tributacao, ambiente,
      cnae, proximo_numero_dps, cclass_trib_padrao, cind_op_padrao,
      dados_reforma_tributaria, xml_nota_referencia_url,
      extraido_automaticamente, confirmado_pelo_medico, atualizado_em
    ) values (
      $1, $2, $3, pgp_sym_encrypt($4, $5),
      $6, $7, $8, $9,
      $10, $11, $12,
      $13, $14, $15,
      $16, $17, $18, $19,
      $20, $21,
      true, false, now()
    )
    on conflict (medico_id) do update set
      tipo_pessoa = excluded.tipo_pessoa,
      cpf_cnpj_hash = excluded.cpf_cnpj_hash,
      cpf_cnpj_encriptado = excluded.cpf_cnpj_encriptado,
      razao_social = excluded.razao_social,
      nome_fantasia = excluded.nome_fantasia,
      inscricao_municipal = excluded.inscricao_municipal,
      uf = excluded.uf,
      cod_municipio_ibge = excluded.cod_municipio_ibge,
      serie_dps = excluded.serie_dps,
      opcao_simples_nacional = excluded.opcao_simples_nacional,
      regime_apuracao_sn = excluded.regime_apuracao_sn,
      regime_especial_tributacao = excluded.regime_especial_tributacao,
      ambiente = excluded.ambiente,
      cnae = excluded.cnae,
      proximo_numero_dps = excluded.proximo_numero_dps,
      cclass_trib_padrao = excluded.cclass_trib_padrao,
      cind_op_padrao = excluded.cind_op_padrao,
      dados_reforma_tributaria = excluded.dados_reforma_tributaria,
      xml_nota_referencia_url = coalesce(excluded.xml_nota_referencia_url, medico_perfil_fiscal.xml_nota_referencia_url),
      extraido_automaticamente = true,
      confirmado_pelo_medico = false,
      atualizado_em = now();
  `;

  await pool.query(sqlPerfil, [
    medicoId,
    tipoPessoa,
    cpfCnpjHash,
    params.cnpj,
    chaveCriptografia,
    params.razaoSocial,
    params.nomeFantasia,
    params.inscricaoMunicipal,
    params.uf,
    params.codMunicipioIbge,
    params.serieDps,
    params.opcaoSimplesNacional,
    params.regimeApuracaoSn,
    params.regimeEspecialTributacao,
    params.ambiente,
    params.cnae,
    params.proximoNumeroSequencialSugerido,
    params.cclassTribPadrao,
    params.cindOpPadrao,
    JSON.stringify(params.dadosReformaTributaria),
    xmlStorageUrl ?? null
  ]);

  // Se o médico estiver com nome em branco ou genérico, atualiza com a razão/nome do XML
  if (params.razaoSocial) {
    const sqlMedico = `
      update medicos
      set nome_completo = coalesce(nullif(nome_completo, ''), $2),
          atualizado_em = now()
      where id = $1
    `;
    await pool.query(sqlMedico, [medicoId, params.razaoSocial]);
  }
}
