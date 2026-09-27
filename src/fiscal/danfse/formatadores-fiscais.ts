/**
 * Formatadores puros de documentos fiscais e identificadores brasileiros para o DANFSe v2.0.
 * Isola máscaras de CPF, CNPJ, CEP, telefone e resolução de municípios IBGE sem I/O,
 * garantindo apresentação profissional estritamente alinhada aos padrões da Receita Federal.
 */

const MUNICIPIOS_IBGE: Record<string, string> = {
  '4314902': 'PORTO ALEGRE',
  '3550308': 'SÃO PAULO',
  '3304557': 'RIO DE JANEIRO',
  '3106200': 'BELO HORIZONTE',
  '4106902': 'CURITIBA',
  '4205407': 'FLORIANÓPOLIS',
  '5300108': 'BRASÍLIA',
  '2927408': 'SALVADOR',
  '2304400': 'FORTALEZA',
  '2611606': 'RECIFE',
  '5208707': 'GOIÂNIA',
  '1302603': 'MANAUS',
  '1501402': 'BELÉM',
  '4304606': 'CANOAS',
  '4305108': 'CAXIAS DO SUL',
  '4313409': 'NOVO HAMBURGO',
  '4316907': 'SANTA MARIA',
  '4314407': 'PELOTAS'
};

export function formatarCpf(cpf?: string): string {
  if (!cpf) return '-';
  const digitos = cpf.replace(/\D/g, '');
  if (digitos.length !== 11) return cpf;
  return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9, 11)}`;
}

export function formatarCnpj(cnpj?: string): string {
  if (!cnpj) return '-';
  const digitos = cnpj.replace(/\D/g, '');
  if (digitos.length !== 14) return cnpj;
  return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12, 14)}`;
}

export function formatarDocumento(doc?: string): string {
  if (!doc) return '-';
  const digitos = doc.replace(/\D/g, '');
  if (digitos.length === 11) return formatarCpf(digitos);
  if (digitos.length === 14) return formatarCnpj(digitos);
  return doc;
}

export function formatarTelefone(telefone?: string): string {
  if (!telefone) return '-';
  const digitos = telefone.replace(/\D/g, '');
  if (digitos.length === 11) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7, 11)}`;
  }
  if (digitos.length === 10) {
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6, 10)}`;
  }
  return telefone;
}

export function formatarCep(cep?: string): string {
  if (!cep) return '-';
  const digitos = cep.replace(/\D/g, '');
  if (digitos.length !== 8) return cep;
  return `${digitos.slice(0, 5)}-${digitos.slice(5, 8)}`;
}

export function resolverNomeMunicipio(codIbge?: string, nomeFallback?: string): string {
  if (nomeFallback && Number.isNaN(Number(nomeFallback)) && nomeFallback.trim().length > 0) {
    return nomeFallback.trim().toUpperCase();
  }
  if (!codIbge) return 'PORTO ALEGRE';
  const limpo = codIbge.replace(/\D/g, '');
  return MUNICIPIOS_IBGE[limpo] || nomeFallback || 'PORTO ALEGRE';
}

export interface ParametrosChaveAcesso {
  codIbgeMunicipio: string;
  ambiente: 'producao' | 'homologacao';
  anoMes: string; // AAMM ou AAAA-MM
  cnpjOuCpf: string;
  serie: string;
  ndps: string | number;
}

/**
 * Gera ou valida a Chave de Acesso Nacional de 50 dígitos da SEFIN/Receita Federal:
 * [cMun 7] + [tpAmb 1] + [AAMM 4] + [CNPJ/CPF 14] + [mod 2] + [serie 5] + [nDPS 15] + [cDV 2]
 */
export function comporChaveAcessoNacional(params: ParametrosChaveAcesso): string {
  const cMun = (params.codIbgeMunicipio.replace(/\D/g, '') || '4314902').padEnd(7, '0').slice(0, 7);
  const tpAmb = params.ambiente === 'producao' ? '1' : '2';
  
  const aammLimpo = params.anoMes.replace(/\D/g, '');
  const aamm = aammLimpo.length >= 4 ? aammLimpo.slice(2, 6) : '2609';
  
  const docLimpo = params.cnpjOuCpf.replace(/\D/g, '');
  const doc14 = docLimpo.padStart(14, '0').slice(0, 14);
  
  const modelo = '00';
  const serie5 = params.serie.replace(/\D/g, '').padStart(5, '0').slice(0, 5);
  const ndps15 = String(params.ndps).replace(/\D/g, '').padStart(15, '0').slice(0, 15);
  
  const base48 = `${cMun}${tpAmb}${aamm}${doc14}${modelo}${serie5}${ndps15}`;
  const cdv = calcularDigitoVerificadorModulo11(base48);
  
  return `${base48}${cdv}`;
}

export function formatarChaveAcessoEmGruposDe4(chave: string): string {
  const limpa = chave.replace(/\D/g, '');
  return limpa.replace(/(\d{4})/g, '$1 ').trim();
}

function calcularDigitoVerificadorModulo11(base: string): string {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += Number(base[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const dv1 = soma % 11 < 2 ? 0 : 11 - (soma % 11);
  const dv2 = ((soma + dv1 * 2) % 11) < 2 ? 0 : 11 - ((soma + dv1 * 2) % 11);
  return `${dv1}${dv2}`;
}
