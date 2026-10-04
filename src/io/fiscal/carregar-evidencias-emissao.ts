/** Consultas vinculadas ao médico/solicitação; não busca um serviço arbitrário. */
import type pg from 'pg';
import type { SolicitacaoEmissaoItem } from '../../worker/emissor-dps-service.js';
import type { EvidenciasEmissao } from '../../fiscal/preparacao/preparar-emissao.js';
export async function carregarEvidenciasEmissao(pool: pg.Pool, item: SolicitacaoEmissaoItem): Promise<EvidenciasEmissao> {
  const { rows } = await pool.query(`select
    p.confirmado_pelo_medico as confirmado, p.ambiente, p.opcao_simples_nacional as opcao,
    p.regime_apuracao_sn as regime, p.regime_especial_tributacao as especial,
    p.cod_municipio_ibge as municipio, p.serie_dps as serie, p.xml_nota_referencia_url as referencia,
    s.competencia_emissao::text as competencia,
    (select coalesce(jsonb_agg(distinct to_char(a.data_hora at time zone 'America/Sao_Paulo', 'YYYY-MM-DD')), '[]'::jsonb)
      from solicitacao_nota_agendamentos sa join agendamentos a on a.id = sa.agendamento_id
      where sa.solicitacao_id = s.id and a.medico_id = s.medico_id and a.paciente_id = s.paciente_id) as datas,
    (select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'ctribNac', f.ctrib_nac,
      'cnbs', f.cnbs, 'ctribMun', f.ctrib_mun, 'politica', f.parametros_emissao)), '[]'::jsonb)
      from medico_servicos_fiscais f where f.medico_id = s.medico_id and f.ativo
        and (f.id = s.servico_fiscal_id or (s.servico_fiscal_id is null and f.padrao
          and (s.ctrib_nac = '' or f.ctrib_nac = s.ctrib_nac)))) as servicos
    from solicitacoes_nota s join medico_perfil_fiscal p on p.medico_id = s.medico_id
    where s.id = $1 and s.medico_id = $2 and s.paciente_id = $3`, [item.id, item.medicoId, item.pacienteId]);
  const r = rows[0];
  if (!r) throw new Error('Evidências fiscais da solicitação não encontradas');
  return { perfil: { ambiente: r.ambiente, confirmado: r.confirmado, opcao: r.opcao, regime: r.regime, especial: r.especial, municipio: r.municipio, serie: r.serie, referencia: r.referencia },
    servicos: r.servicos, competenciaInformada: r.competencia, datasConsultas: r.datas };
}
