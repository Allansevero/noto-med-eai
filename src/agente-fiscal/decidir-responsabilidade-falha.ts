/**
 * Decide a quem compete tratar uma falha ou rejeição de emissão:
 * se aos desenvolvedores (erros de sistema, infraestrutura, limitações de regras internas)
 * ou ao usuário/médico (dados cadastrais faltantes, pendências do paciente ou certificado).
 * Garante que falhas técnicas nunca incomodem o médico com cobranças indevidas.
 */
import type { FalhaEmissao } from './investigacao.js';

export type ResponsavelFalha = 'desenvolvedor' | 'usuario';

export interface DecisaoResponsabilidadeFalha {
  responsavel: ResponsavelFalha;
  categoria: 'sistema' | 'infraestrutura' | 'sefin_tecnico' | 'dados_medico' | 'dados_paciente' | 'cadastro_fiscal';
  motivo: string;
  acaoSugerida: string;
}

const CODIGOS_SISTEMA = new Set([
  'FORA_DA_VIGENCIA', 'PARAMETRO_INVALIDO', 'CONFIGURACAO_INVALIDA',
  'SERVICO_AMBIGUO', 'CLASSIFICACAO_DIVERGENTE', 'COMPETENCIA_INDEFINIDA',
  'PREPARACAO_NECESSARIA', 'DESCRICAO_AUSENTE', 'REFERENCIA_PENDENTE'
]);

const CODIGOS_CADASTRO_USUARIO = new Set([
  'PERFIL_NAO_CONFIRMADO', 'PARAMETROS_NAO_CONFIRMADOS',
  'REGIME_DIVERGENTE', 'PERFIL_ALTERADO'
]);

function classificarPorPendenciaFiscal(falha: FalhaEmissao): DecisaoResponsabilidadeFalha | null {
  const pendencias = falha.pendenciasFiscais;
  if (!pendencias || pendencias.length === 0) return null;
  const p = pendencias[0];
  if (p.codigo === 'FORA_DA_VIGENCIA') {
    return {
      responsavel: 'desenvolvedor',
      categoria: 'sistema',
      motivo: 'Regra de vigência fiscal da aplicação não cobre a competência requerida.',
      acaoSugerida: 'Ajustar no sistema a regra de vigência e o tratamento de competência da emissão.'
    };
  }
  if (CODIGOS_SISTEMA.has(p.codigo)) {
    return {
      responsavel: 'desenvolvedor',
      categoria: 'sistema',
      motivo: `Inconsistência interna de parâmetros fiscais (${p.codigo}: ${p.mensagem}).`,
      acaoSugerida: 'Revisar código e mapeamento interno de parâmetros fiscais.'
    };
  }
  if (CODIGOS_CADASTRO_USUARIO.has(p.codigo)) {
    return {
      responsavel: 'usuario',
      categoria: 'cadastro_fiscal',
      motivo: 'Parâmetros ou enquadramento fiscal pendentes de confirmação pelo usuário.',
      acaoSugerida: 'Confirmar os parâmetros fiscais e dados do perfil no painel de onboarding.'
    };
  }
  if (p.campo === 'valor') {
    return {
      responsavel: 'usuario',
      categoria: 'dados_paciente',
      motivo: 'Valor do serviço inválido ou não informado para a consulta.',
      acaoSugerida: 'Informar um valor positivo válido para a consulta.'
    };
  }
  return null;
}

function classificarPorDadosProfissionais(falha: FalhaEmissao): DecisaoResponsabilidadeFalha | null {
  if (!falha.dadosProfissionaisPendentes) return null;
  return {
    responsavel: 'usuario',
    categoria: 'dados_medico',
    motivo: 'Nome completo ou CRM do médico não preenchidos no cadastro.',
    acaoSugerida: 'Completar o cadastro informando nome completo e CRM válidos.'
  };
}

function classificarPorInfraestrutura(falha: FalhaEmissao): DecisaoResponsabilidadeFalha | null {
  if (falha.falhaAntesDoEnvio === 'EAI_AGAIN' || falha.falhaAntesDoEnvio === 'ECONNREFUSED') {
    return {
      responsavel: 'desenvolvedor',
      categoria: 'infraestrutura',
      motivo: 'Falha de resolução DNS ou conexão de rede com a SEFIN.',
      acaoSugerida: 'Verificar infraestrutura de rede, DNS e estabilidade de saída.'
    };
  }
  if (falha.httpStatus && falha.httpStatus >= 500) {
    return {
      responsavel: 'desenvolvedor',
      categoria: 'sefin_tecnico',
      motivo: `Servidor da SEFIN retornou erro HTTP ${falha.httpStatus}.`,
      acaoSugerida: 'Monitorar disponibilidade da SEFIN e verificar logs da requisição.'
    };
  }
  if (falha.httpStatus === 401 || falha.httpStatus === 403) {
    return {
      responsavel: 'usuario',
      categoria: 'cadastro_fiscal',
      motivo: 'Certificado digital recusado ou não autorizado pela SEFIN.',
      acaoSugerida: 'Verificar a validade do certificado digital A1 e a habilitação municipal do prestador.'
    };
  }
  return null;
}

function classificarPorCodigoSefin(falha: FalhaEmissao): DecisaoResponsabilidadeFalha | null {
  const cod = falha.codigoErroSefin;
  if (!cod) return null;
  if (['E0014', 'E0006', 'E0676'].includes(cod)) {
    return {
      responsavel: 'desenvolvedor',
      categoria: 'sistema',
      motivo: `Inconsistência técnica no leiaute ou numeração da DPS (SEFIN ${cod}).`,
      acaoSugerida: 'Reconciliar numeração ou formato de tags XML gerado pelo sistema.'
    };
  }
  if (['E0116', 'E0160', 'E0166'].includes(cod)) {
    return {
      responsavel: 'usuario',
      categoria: 'cadastro_fiscal',
      motivo: `Dados cadastrais divergem do cadastro oficial na prefeitura (SEFIN ${cod}).`,
      acaoSugerida: 'Verificar a Inscrição Municipal e o enquadramento tributário junto à prefeitura ou contabilidade.'
    };
  }
  return null;
}

function padraoDesenvolvedor(motivo: string): DecisaoResponsabilidadeFalha {
  return {
    responsavel: 'desenvolvedor',
    categoria: 'sistema',
    motivo,
    acaoSugerida: 'Analisar causa da falha nos registros de auditoria e código da aplicação.'
  };
}

export function decidirResponsabilidadeFalha(falha?: FalhaEmissao): DecisaoResponsabilidadeFalha {
  if (!falha) return padraoDesenvolvedor('Falha não especificada na emissão.');
  const pendencia = classificarPorPendenciaFiscal(falha);
  if (pendencia) return pendencia;
  const profissional = classificarPorDadosProfissionais(falha);
  if (profissional) return profissional;
  const infra = classificarPorInfraestrutura(falha);
  if (infra) return infra;
  const sefin = classificarPorCodigoSefin(falha);
  if (sefin) return sefin;

  const texto = falha.erro.toLowerCase();
  if (texto.includes('paciente') || texto.includes('cpf') || texto.includes('crm')) {
    return {
      responsavel: 'usuario',
      categoria: 'dados_paciente',
      motivo: falha.erro,
      acaoSugerida: 'Conferir os dados informados do paciente ou profissional.'
    };
  }
  return padraoDesenvolvedor(falha.erro);
}
