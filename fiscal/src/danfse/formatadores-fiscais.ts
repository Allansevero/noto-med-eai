/**
 * Formatadores puros de documentos fiscais e identificadores brasileiros para o DANFSe.
 * Isola máscaras de CPF, CNPJ, telefone e valores monetários sem I/O.
 */

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

export function formatarMoedaCentavos(centavos?: number): string {
  if (centavos === undefined || centavos === null || Number.isNaN(centavos)) return 'R$ 0,00';
  const reais = (centavos / 100).toFixed(2);
  const [inteiro, decimal] = reais.split('.');
  const formatadoInteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${formatadoInteiro},${decimal}`;
}
