/**
 * Consulta o estado atual do médico no checklist dos 5 passos do onboarding.
 * Determina quais etapas já foram completadas e se o médico já está liberado
 * para emitir notas fiscais pelo WhatsApp (seção 1 do plano).
 */

import type pg from 'pg';

export type StatusOnboardingMedico = {
  medicoId: string;
  usuarioId: string;
  nomeUsuario: string;
  passos: {
    passo1Nome: boolean;
    passo2XmlEnviado: boolean;
    passo2FiscalConfirmado: boolean;
    passo3CertificadoValido: boolean;
    passo4WhatsappConectado: boolean;
  };
  liberadoParaEmitir: boolean;
  perfilFiscal?: {
    razaoSocial: string | null;
    cnpjCpfMask: string | null;
    inscricaoMunicipal: string | null;
    uf: string | null;
    codMunicipioIbge: string | null;
    serieDps: string;
    proximoNumeroDps: number;
    opcaoSimplesNacional?: 'nao_optante' | 'mei' | 'me_epp';
    extraidoAutomaticamente: boolean;
    confirmadoPeloMedico: boolean;
    especialidade: string | null;
    aliquotaIss: number | null;
  } | null;
};

export async function consultarStatusOnboarding(
  pool: pg.Pool,
  medicoId: string
): Promise<StatusOnboardingMedico> {
  const sql = `
    select
      m.id as medico_id,
      m.usuario_id,
      m.nome_completo as medico_nome,
      m.especialidade,
      u.nome as usuario_nome,
      pf.razao_social,
      pf.inscricao_municipal,
      pf.uf,
      pf.cod_municipio_ibge,
      pf.serie_dps,
      pf.proximo_numero_dps,
      pf.opcao_simples_nacional,
      pf.extraido_automaticamente,
      pf.confirmado_pelo_medico,
      msf.aliquota_iss,
      (select count(*) from medico_certificados c where c.medico_id = m.id and c.status = 'ativo') as cert_ativos,
      (select count(*) from whatsapp_instancias w where w.medico_id = m.id and w.status = 'conectado') as whats_conectados
    from medicos m
    join usuarios u on u.id = m.usuario_id
    left join medico_perfil_fiscal pf on pf.medico_id = m.id
    left join medico_servicos_fiscais msf on msf.medico_id = m.id and msf.padrao = true
    where m.id = $1
    limit 1
  `;

  const { rows } = await pool.query(sql, [medicoId]);
  if (rows.length === 0) {
    throw new Error(`Médico ${medicoId} não encontrado.`);
  }

  const r = rows[0];
  const nomeExibicao = (r.medico_nome || r.usuario_nome || '').trim();
  const passo1Nome = Boolean(nomeExibicao.length > 2 && nomeExibicao !== 'Médico');
  const passo2XmlEnviado = Boolean(r.extraido_automaticamente || r.confirmado_pelo_medico);
  const passo2FiscalConfirmado = Boolean(r.confirmado_pelo_medico);
  const passo3CertificadoValido = Number(r.cert_ativos || 0) > 0;
  const passo4WhatsappConectado = Number(r.whats_conectados || 0) > 0;

  const liberadoParaEmitir = passo1Nome && passo2FiscalConfirmado && passo3CertificadoValido && passo4WhatsappConectado;

  return {
    medicoId: r.medico_id,
    usuarioId: r.usuario_id,
    nomeUsuario: nomeExibicao || 'Dr(a).',
    passos: {
      passo1Nome,
      passo2XmlEnviado,
      passo2FiscalConfirmado,
      passo3CertificadoValido,
      passo4WhatsappConectado
    },
    liberadoParaEmitir,
    perfilFiscal: r.razao_social ? {
      razaoSocial: r.razao_social,
      cnpjCpfMask: 'Cadastrado / Seguro',
      inscricaoMunicipal: r.inscricao_municipal,
      uf: r.uf,
      codMunicipioIbge: r.cod_municipio_ibge,
      serieDps: r.serie_dps || '00001',
      proximoNumeroDps: r.proximo_numero_dps || 1,
      opcaoSimplesNacional: r.opcao_simples_nacional || 'me_epp',
      extraidoAutomaticamente: r.extraido_automaticamente,
      confirmadoPeloMedico: r.confirmado_pelo_medico,
      especialidade: r.especialidade,
      aliquotaIss: r.aliquota_iss ? Number(r.aliquota_iss) : null
    } : null
  };
}
