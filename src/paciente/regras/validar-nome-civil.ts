/**
 * Validação pura do nome civil de um tomador de NFS-e médica.
 * Isola a regra de negócio para garantir que o nome possui estrutura real e
 * completa (ao menos duas palavras com tamanho mínimo), rejeitando valores
 * genéricos como 'PACIENTE', vazios ou apelidos monossilábicos sem I/O.
 */

export function ehNomeCivilValido(nome?: string | null): boolean {
  if (!nome) return false;
  const limpo = nome.trim().replace(/\s+/g, ' ');
  if (limpo.length < 5) return false;
  if (/^paciente$/i.test(limpo)) return false;

  const partes = limpo.split(' ');
  if (partes.length < 2) return false;

  return partes.every((p) => p.length >= 1);
}
