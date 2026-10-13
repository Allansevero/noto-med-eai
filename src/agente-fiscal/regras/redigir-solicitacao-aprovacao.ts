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
  ehContinuacao?: boolean;
}

export function redigirSolicitacaoAprovacao(params: ParametrosRedacaoAprovacao): string {
  const { candidato, nomeMedico, ehContinuacao } = params;

  const primeiroNomeMedico = extrairPrimeiroNome(nomeMedico);
  const saudacao = ehContinuacao
    ? 'Também encontrei'
    : (primeiroNomeMedico ? `Oi, Dr(a). ${primeiroNomeMedico}! Encontrei` : 'Oi! Encontrei');

  const nomePacienteFormatado = capitalizarNome(candidato.pacienteNome);
  const telefoneFormatado = formatarTelefoneVisual(candidato.pacienteTelefone);
  const identificacaoPaciente = telefoneFormatado
    ? `${nomePacienteFormatado} (${telefoneFormatado})`
    : nomePacienteFormatado;

  const dataTexto = candidato.dataConsulta ? `da consulta de ${candidato.dataConsulta}` : 'da última consulta';
  const perguntaFinal = ehContinuacao ? 'Posso emitir essa também?' : 'Posso emitir a nota fiscal dela?';

  // Formato natural em 1 a 2 linhas, sem campos com dois pontos ("Paciente: ..."), sem título robótico
  return `${saudacao} o pagamento de R$ ${candidato.valorFormatado} da paciente ${identificacaoPaciente}, ${dataTexto}. ${perguntaFinal}`;
}

function extrairPrimeiroNome(nomeCompleto?: string | null): string {
  if (!nomeCompleto || !nomeCompleto.trim()) return '';
  const limpo = nomeCompleto
    .trim()
    .replace(/^(?:dr[a-z]?\.?|m[ée]dic[oa]\.?)\s+/i, '')
    .trim();
  const partes = limpo.split(/\s+/);
  const primeiro = partes[0] || '';
  if (!primeiro) return '';
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase();
}

const PREPOSICOES_NOME = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em']);

function capitalizarNome(nome: string): string {
  if (!nome || !nome.trim()) return '';
  return nome
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, idx) => {
      if (idx > 0 && PREPOSICOES_NOME.has(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(' ');
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
