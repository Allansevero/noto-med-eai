/** Autorização controlada; a IA não decide nem libera emissões. */
export function interpretarConfirmacaoNotas(texto:string):boolean {
  return /^(?:pode emitir(?: as notas)?|autorizo a emissão das notas)[.!]*$/u.test(texto.trim().toLocaleLowerCase('pt-BR'));
}
