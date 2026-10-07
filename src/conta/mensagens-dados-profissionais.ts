export function pedirNomeCompleto(): string {
  return 'A nota está pausada porque falta seu nome completo. Qual é seu nome completo, como consta nos seus documentos?';
}

export function pedirCrm(): string {
  return 'Qual é seu CRM, com número e UF?';
}

export function confirmarNotasPendentes(): string {
  return 'As notas anteriores continuam pausadas. Para autorizar a retomada, responda “pode emitir”.';
}

export function confirmarDadosSalvos(): string {
  return 'Dados salvos. Vou conferir se falta mais alguma coisa para emitir.';
}

export function confirmarRetomadaNotas(): string {
  return 'Recebi sua autorização para retomar as notas. As que já tiveram tentativa de emissão precisam ser conferidas antes de tentar de novo.';
}

export function orientarConfirmacaoNotas(): string {
  return 'Posso retomar suas notas pendentes? Se quiser, responda “pode emitir”.';
}

export function interpretarConfirmacaoNotas(texto: string): boolean {
  const confirmacao = texto.trim().toLocaleLowerCase('pt-BR');
  return /^(?:pode emitir(?: as notas)?|autorizo a emissão das notas)[.!]*$/u.test(confirmacao);
}
