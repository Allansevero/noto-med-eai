/**
 * Redação humanizada da mensagem de solicitação de aprovação de emissão de nota ao médico.
 * Segue estritamente as diretrizes de tom de voz do Noto (docs/prompts/noto-conversa.md):
 * - Pessoa da equipe atenciosa e direta;
 * - Sem títulos em caixa alta ou emojis alarmistas;
 * - Identifica o paciente, valor, telefone e data na primeira frase;
 * - Pergunta clara e natural para o médico autorizar com um simples "sim".
 */

import type { CandidatoNotaFiscal } from './correlacionar-consulta-pagamento.js';

export interface ParametrosRedacaoAprovacao {
  candidato: CandidatoNotaFiscal;
  nomeMedico?: string | null;
}

export function redigirSolicitacaoAprovacao(params: ParametrosRedacaoAprovacao): string {
  const { candidato, nomeMedico } = params;

  const primeiroNomeMedico = extrairPrimeiroNome(nomeMedico);
  const saudacao = primeiroNomeMedico ? `Oi, Dr(a). ${primeiroNomeMedico}!` : 'Oi!';

  const telefoneFormatado = formatarTelefoneVisual(candidato.pacienteTelefone);
  const identificacaoPaciente = telefoneFormatado
    ? `${candidato.pacienteNome} (${telefoneFormatado})`
    : candidato.pacienteNome;

  const dataTexto = candidato.dataConsulta ? `da consulta de ${candidato.dataConsulta}` : 'da última consulta';

  // Formato natural em 1 a 2 linhas, sem campos com dois pontos ("Paciente: ..."), sem título robótico
  return `${saudacao} Encontrei o pagamento de R$ ${candidato.valorFormatado} da paciente ${identificacaoPaciente}, ${dataTexto}. Posso emitir a nota fiscal dela?`;
}

function extrairPrimeiroNome(nomeCompleto?: string | null): string {
  if (!nomeCompleto || !nomeCompleto.trim()) return '';
  const limpo = nomeCompleto
    .trim()
    .replace(/^(?:dr[a-z]?\.?|m[ée]dic[oa]\.?)\s+/i, '')
    .trim();
  const partes = limpo.split(/\s+/);
  return partes[0];
}

function formatarTelefoneVisual(telefone: string): string {
  const limpo = telefone.replace(/\D/g, '');
  if (limpo.length === 11) {
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 7)}-${limpo.slice(7)}`;
  }
  if (limpo.length === 10) {
    return `(${limpo.slice(0, 2)}) ${limpo.slice(2, 6)}-${limpo.slice(6)}`;
  }
  return telefone;
}
