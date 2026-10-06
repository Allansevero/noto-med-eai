/** Relatório consultivo vinculado ao certificado e XML atuais; não escreve perfil nem política fiscal. */
import { createHash } from 'node:crypto';
import type pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';
import { carregarCertificadoMedico } from '../../io/fiscal/carregar-certificado-medico.js';
import { extrairChavesCertificado } from '../../io/fiscal/extrair-chaves-certificado.js';
import { consultarCadastroCnpj } from '../../io/fiscal/consultar-cadastro-cnpj.js';
import { consultarParametrosMunicipais } from '../../io/fiscal/consultar-parametros-municipais.js';
import { gerarHashCpf } from '../../paciente/hash-cpf.js';
import { lerXmlNotaReferencia } from '../io/ler-xml-nota-referencia.js';
import { extrairCamposComparacao, camposDosParametros } from '../../fiscal/comparacao/extrair-campos-comparacao.js';
import { compararDadosFiscais } from '../../fiscal/comparacao/comparar-dados-fiscais.js';
import type { CamposFiscais, ContextoComparacao, EvidenciasExternas } from '../../fiscal/comparacao/tipos.js';
import { parametrosEmissaoSchema } from '../../fiscal/preparacao/parametros-emissao.js';
import { validarReferenciaFiscal } from '../../fiscal/preparacao/validar-referencia-fiscal.js';

interface Dependencias {
  pool: pg.Pool; supabase: SupabaseClient; pepper: string;
  cadastro?: typeof consultarCadastroCnpj;
  municipio?: typeof consultarParametrosMunicipais;
  carregarCertificado?: typeof carregarCertificadoMedico;
  extrairCertificado?: typeof extrairChavesCertificado;
  agora?: () => Date;
}

async function carregarPerfil(pool: pg.Pool, medicoId: string) {
  const { rows } = await pool.query(`select p.*, s.ctrib_nac, s.ctrib_mun, s.cnbs,
    to_jsonb(s)->'parametros_emissao' as politica
    from medico_perfil_fiscal p
    left join medico_servicos_fiscais s on s.medico_id = p.medico_id and s.padrao and s.ativo
    where p.medico_id = $1`, [medicoId]);
  if (rows.length > 1) throw new Error('Há mais de um serviço padrão. Revise o cadastro antes de comparar.');
  return rows[0];
}

async function carregarReferencia(deps: Dependencias, perfil: any, documento: string) {
  const meta = perfil?.dados_reforma_tributaria;
  if (!meta?.hash || !perfil?.xml_nota_referencia_url) return { campos: {} as CamposFiscais, hash: null };
  if (perfil.cpf_cnpj_hash !== gerarHashCpf(documento, deps.pepper)) {
    throw new Error('O certificado atual e a referência pertencem a titulares diferentes. Importe a nota do titular atual.');
  }
  const { data, error } = await deps.supabase.storage.from('xmls_referencia').download(perfil.xml_nota_referencia_url);
  if (error || !data) throw new Error('Não foi possível ler a nota de referência para comparar. Tente novamente.');
  const xml = await data.text();
  if (createHash('sha256').update(xml).digest('hex') !== meta.hash) throw new Error('O XML de referência mudou. Importe novamente antes de comparar.');
  const { xmlObj } = lerXmlNotaReferencia(xml);
  const inf = xmlObj.NFSe?.infNFSe;
  const titularXml = String(inf?.emit?.CNPJ ?? inf?.DPS?.infDPS?.prest?.CNPJ ?? inf?.emit?.CPF ?? '');
  if (titularXml !== documento) throw new Error('O XML não corresponde ao titular do certificado.');
  return { campos: extrairCamposComparacao(xmlObj), hash: meta.hash as string };
}

export async function compararPerfilFiscal(deps: Dependencias, medicoId: string) {
  const agora = (deps.agora ?? (() => new Date()))();
  const certificado = await (deps.carregarCertificado ?? carregarCertificadoMedico)(deps.pool, deps.supabase, medicoId);
  if (!certificado) throw new Error('Cadastre o certificado A1 antes de consultar os dados fiscais.');
  const titular = (deps.extrairCertificado ?? extrairChavesCertificado)(certificado.pfxBuffer, certificado.senhaCertificado);
  if (!titular.documentoTitular || !titular.validoAte || titular.validoAte < agora || (titular.validoDe && titular.validoDe > agora)) {
    throw new Error('O certificado precisa estar válido e identificar o titular para realizar as consultas.');
  }
  const perfil = await carregarPerfil(deps.pool, medicoId);
  const ref = await carregarReferencia(deps, perfil, titular.documentoTitular);
  const meta = perfil?.dados_reforma_tributaria;
  const competencia = meta?.competencia || agora.toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(competencia) || !Number.isFinite(Date.parse(competencia)) || new Date(competencia).toISOString().slice(0, 10) !== competencia) {
    throw new Error('A referência precisa ter uma competência válida para comparar as consultas.');
  }
  const ambiente = perfil?.ambiente === 'homologacao' ? 'homologacao' : 'producao';
  const politica = perfil?.politica;
  const parametros = politica?.parametros ?? meta?.parametrosSugeridos ?? {};
  const validacao = parametrosEmissaoSchema.safeParse(parametros);
  // São campos preparados, não uma promessa de que todos já sejam serializados.
  const preparado = camposDosParametros(parametros);
  if (perfil) Object.assign(preparado, { razaoSocial: perfil.razao_social, municipioEmitente: perfil.cod_municipio_ibge,
    ctribNac: perfil.ctrib_nac ?? null, ctribMun: perfil.ctrib_mun ?? null, cnbs: perfil.cnbs ?? null });
  const contexto: ContextoComparacao = { referenciaHash: ref.hash, numero: meta?.numero || null, competencia, ambiente,
    referencia: ref.campos, preparado, politicaConfirmada: Boolean(perfil?.confirmado_pelo_medico && politica?.confirmadoEm)
      && validacao.success && validarReferenciaFiscal(meta, politica).length === 0,
    pendencias: [...(meta?.pendencias ?? [])] };
  if (!validacao.success) contexto.pendencias.push('A configuração para emissão ainda está incompleta ou contém situações não suportadas. Revise os campos e a vigência antes de confirmar.');
  const chaveContexto = createHash('sha256').update(JSON.stringify([certificado.id, ref.hash, competencia, ambiente])).digest('hex');
  const cache = await deps.pool.query(`select evidencias, consultado_em from consultas_fiscais_onboarding
    where medico_id = $1 and chave_contexto = $2 and consultado_em > $3::timestamptz - interval '5 minutes'`,
  [medicoId, chaveContexto, agora.toISOString()]);
  let evidencias: EvidenciasExternas;
  let consultadoEm = agora.toISOString();
  if (cache.rows[0]) {
    evidencias = cache.rows[0].evidencias;
    consultadoEm = new Date(cache.rows[0].consultado_em).toISOString();
  } else {
    const cadastral = await (deps.cadastro ?? consultarCadastroCnpj)(titular.documentoTitular);
    // Município do cadastro só permite consultar convênio quando não há XML.
    // Serviço e município de incidência nunca são inferidos a partir do CNAE.
    const municipio = String(ref.campos.municipioEmitente ?? cadastral.dados.municipioEmitente ?? '');
    const servico = ref.campos.ctribNac ? String(ref.campos.ctribNac) + (ref.campos.ctribMun ?? '') : undefined;
    const municipal = await (deps.municipio ?? consultarParametrosMunicipais)({ municipio,
      municipioIncidencia: typeof ref.campos.municipioIncidencia === 'string' ? ref.campos.municipioIncidencia : undefined,
      servico, competencia, ambiente,
      pfx: certificado.pfxBuffer, senha: certificado.senhaCertificado });
    evidencias = { cadastral, ...municipal };
  }
  // Evita devolver um relatório antigo se o A1/XML mudou enquanto as APIs respondiam.
  const atual = await deps.pool.query(`select c.id as certificado_id, p.dados_reforma_tributaria->>'hash' as referencia_hash
    from medico_certificados c left join medico_perfil_fiscal p on p.medico_id = c.medico_id
    where c.medico_id = $1 and c.status = 'ativo' order by c.criado_em desc limit 1`, [medicoId]);
  if (atual.rows[0]?.certificado_id !== certificado.id || (atual.rows[0]?.referencia_hash ?? null) !== ref.hash) {
    throw new Error('O certificado ou a referência mudou durante a consulta. Abra a comparação novamente.');
  }
  if (!cache.rows[0]) await deps.pool.query(`insert into consultas_fiscais_onboarding
    (medico_id, chave_contexto, certificado_id, referencia_hash, competencia, ambiente, evidencias, consultado_em)
    values ($1, $2, $3, $4, $5, $6, $7, $8)
    on conflict (medico_id, chave_contexto) do update set evidencias = excluded.evidencias, consultado_em = excluded.consultado_em`,
  [medicoId, chaveContexto, certificado.id, ref.hash, competencia, ambiente, JSON.stringify(evidencias), consultadoEm]);
  return compararDadosFiscais(contexto, evidencias, consultadoEm);
}
