/**
 * Valida se uma resposta do usuário corresponde à pergunta pelo nome completo da médica.
 * Garante que o nome da médica seja obtido por resposta explícita e direta à pergunta,
 * e não extraído acidentalmente do perfil do WhatsApp ou da resposta a outro tópico.
 */

export interface ContextoExtracaoNome {
  perguntaAtual: 'nome_medica' | 'crm_rqe' | 'janela_tempo' | 'preferencia_data' | 'outro';
  ehApresentacaoSecretaria?: boolean;
}

export type MotivoInvalidoNome = 'pergunta_diferente' | 'apresentacao_secretaria' | 'nome_muito_curto';

export type ResultadoExtracaoNomeMedica =
  | { valido: true; nomeExtraido: string }
  | { valido: false; motivoInvalido: MotivoInvalidoNome };

export function extrairNomeMedicaResposta(
  textoResposta: string,
  contexto: ContextoExtracaoNome
): ResultadoExtracaoNomeMedica {
  if (contexto.perguntaAtual !== 'nome_medica') {
    return { valido: false, motivoInvalido: 'pergunta_diferente' };
  }

  if (contexto.ehApresentacaoSecretaria) {
    return { valido: false, motivoInvalido: 'apresentacao_secretaria' };
  }

  const limpo = textoResposta
    .replace(/^(?:o meu nome [eé]|meu nome [eé]|sou a|sou o|dra?\.?|dr\.?)\s+/i, '')
    .trim();

  // Nome precisa ter pelo menos 2 partes (nome e sobrenome)
  const partes = limpo.split(/\s+/).filter(p => p.length >= 2);
  if (partes.length < 2) {
    return { valido: false, motivoInvalido: 'nome_muito_curto' };
  }

  return {
    valido: true,
    nomeExtraido: partes.join(' ')
  };
}
