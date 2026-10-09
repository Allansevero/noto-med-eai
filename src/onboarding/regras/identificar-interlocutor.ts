/**
 * Identificação do papel de quem está falando na conversa (Médica vs Secretária).
 * Secretária possui cadastro próprio e precisa ser vinculada à médica.
 * A apresentação da secretária não deve ser confundida com o nome da médica.
 */

export type PapelInterlocutor = 'medica' | 'secretaria' | 'desconhecido';

export interface InterlocutorIdentificado {
  papel: PapelInterlocutor;
  nomeInformado?: string;
  ehApresentacaoSecretaria: boolean;
}

export function identificarInterlocutor(texto: string): InterlocutorIdentificado {
  const t = texto.trim();
  const tLower = t.toLowerCase();

  // Padrões explícitos de secretária/assistente
  const regexSecretaria = /\b(?:sou a secret[aá]ria|sou secret[aá]ria|falo da recep[cç][aã]o|sou assistente da|trabalho com a dra?\.?)\b/i;
  if (regexSecretaria.test(tLower)) {
    const matchNome = t.match(/(?:sou a secret[aá]ria|sou secret[aá]ria|me chamo|aqui [eé] a)\s+([A-ZÀ-Úa-zà-ú]+)/i);
    return {
      papel: 'secretaria',
      nomeInformado: matchNome ? matchNome[1].trim() : undefined,
      ehApresentacaoSecretaria: true
    };
  }

  // Padrões explícitos de médica
  const regexMedica = /\b(?:sou a dra?\.?|sou o dr\.?|sou médica|sou médico)\b/i;
  if (regexMedica.test(tLower)) {
    const matchNome = t.match(/(?:sou a dra?\.?|sou o dr\.?|sou médica|sou médico|me chamo)\s+([A-ZÀ-Úa-zà-ú]+(?:\s+[A-ZÀ-Úa-zà-ú]+)*)/i);
    return {
      papel: 'medica',
      nomeInformado: matchNome ? matchNome[1].trim() : undefined,
      ehApresentacaoSecretaria: false
    };
  }

  return {
    papel: 'desconhecido',
    ehApresentacaoSecretaria: false
  };
}
