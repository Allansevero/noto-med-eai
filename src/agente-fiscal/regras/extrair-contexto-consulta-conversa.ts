/**
 * Extração de contexto de consulta (nome do paciente e data da consulta)
 * anterior ao comprovante de pagamento no histórico do WhatsApp.
 * Isola 100% da regra de negócio sem I/O ou dependências de rede.
 */

import { extrairDatasConsulta } from '../../emissao/regras/extrair-datas-consulta.js';
import type { MensagemContextoConversa } from './correlacionar-consulta-pagamento.js';

export interface ContextoConsultaDetectado {
  nomePaciente: string;
  dataConsultaFormatada: string;
  dataConsultaIso: string;
  mensagemId?: string;
  trecho?: string;
}

const REGEX_AGENDAMENTO = /(?:agendad[oa]|marcad[oa]|confirmad[oa]|combinad[oa]|consulta|atendimento|sess[aã]o|retorno|procedimento|hor[áa]rio|te\s+espero|marcar|nos\s+vemos)\s*(?:para|de|em|dia)?,?\s*\*?(\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?)\*?/i;
const REGEX_GATILHO_DATA = /(?:agendad|marcad|confirmad|combinad|hor[áa]rio|consulta|procedimento|retorno|sess[aã]o|m[ée]dic|dr|espero)/i;
const REGEX_SAUDACAO_NOME = /(?:bom\s+dia|boa\s+tarde|boa\s+noite|ol[áa]|oi),?\s*\*?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\*?(?:,|\s+tudo\s+bem|\s+como\s+vai|\.|\!|\?|\s+voc[êe]|\s+pode|\s+obrigad|\s+estamos|\n|$)/i;

export function extrairContextoConsultaConversa(
  mensagensAnteriores: MensagemContextoConversa[],
  _msgPagamento: MensagemContextoConversa,
  nomeCadastro: string | null | undefined,
  _agora: Date,
  dataConsultaReferencia?: string
): ContextoConsultaDetectado {
  let nomeEncontrado = limparNomeContato(nomeCadastro);
  let dataConsultaFormatada = '';
  let dataConsultaIso = '';
  let mensagemId: string | undefined;
  let trecho: string | undefined;

  // 1. Prioridade: Se o comprovante / PIX já tem a referência da consulta na descrição
  if (dataConsultaReferencia) {
    const extraidoComp = normalizarDataIsoOuBr(dataConsultaReferencia);
    if (extraidoComp) {
      dataConsultaFormatada = extraidoComp.formatada;
      dataConsultaIso = extraidoComp.iso;
      trecho = `Informado no comprovante: ${dataConsultaReferencia}`;
    }
  }

  // 2. Busca na conversa de trás para frente (da mais recente para a mais antiga)
  for (let i = mensagensAnteriores.length - 1; i >= 0; i--) {
    const msg = mensagensAnteriores[i];
    const texto = msg.conteudo || '';

    if (!nomeEncontrado && msg.direcao === 'enviada') {
      const matchNome = texto.match(REGEX_SAUDACAO_NOME);
      if (matchNome && matchNome[1].length >= 3 && !ehTermoInvalidoNome(matchNome[1].trim())) {
        nomeEncontrado = matchNome[1].trim();
      }
    }

    if (!dataConsultaFormatada) {
      const achouData = extrairDataDeTextoMensagem(texto, new Date(msg.criadoEm), msg.id);
      if (achouData) {
        dataConsultaFormatada = achouData.formatada;
        dataConsultaIso = achouData.iso;
        mensagemId = achouData.mensagemId;
        trecho = achouData.trecho;
      }
    }

    if (nomeEncontrado && dataConsultaFormatada) break;
  }

  return {
    nomePaciente: nomeEncontrado || 'Paciente',
    dataConsultaFormatada,
    dataConsultaIso,
    mensagemId,
    trecho
  };
}

function extrairDataDeTextoMensagem(
  texto: string,
  dataRef: Date,
  msgId: string
): { formatada: string; iso: string; mensagemId: string; trecho: string } | null {
  const matchAgendamento = texto.match(REGEX_AGENDAMENTO);
  if (matchAgendamento) {
    const extraido = extrairDatasConsulta(matchAgendamento[1], dataRef);
    if (extraido.encontrou && extraido.datas.length > 0) {
      const d = extraido.datas[0];
      return { formatada: formatarDataBr(d), iso: d.toISOString().slice(0, 10), mensagemId: msgId, trecho: matchAgendamento[0] };
    }
  }

  if (REGEX_GATILHO_DATA.test(texto)) {
    const extraido = extrairDatasConsulta(texto, dataRef);
    if (extraido.encontrou && extraido.datas.length > 0) {
      const d = extraido.datas[0];
      return { formatada: formatarDataBr(d), iso: d.toISOString().slice(0, 10), mensagemId: msgId, trecho: texto.slice(0, 100) };
    }
  }

  return null;
}

function normalizarDataIsoOuBr(valor: string): { formatada: string; iso: string } | null {
  const matchBr = valor.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (matchBr) {
    const d = matchBr[1].padStart(2, '0');
    const m = matchBr[2].padStart(2, '0');
    const y = matchBr[3];
    return { formatada: `${d}/${m}/${y}`, iso: `${y}-${m}-${d}` };
  }
  const matchIso = valor.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (matchIso) {
    return { formatada: `${matchIso[3]}/${matchIso[2]}/${matchIso[1]}`, iso: `${matchIso[1]}-${matchIso[2]}-${matchIso[3]}` };
  }
  return null;
}

function formatarDataBr(d: Date): string {
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}/${d.getFullYear()}`;
}

function limparNomeContato(nome?: string | null): string {
  if (!nome || !nome.trim()) return '';
  const limpo = nome
    .trim()
    .replace(/\s*(?:pct|paciente|dra?\.?|dr\.?|doutor|doutora|consulta|psiquiatria).*$/i, '')
    .replace(/\s*[\(\[].*?[\)\]]/g, '')
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (limpo.length < 3 || ehTermoInvalidoNome(limpo)) return '';
  return limpo;
}

const TERMOS_INVALIDOS = new Set([
  'tudo bem', 'tudo bom', 'tudo certo', 'como vai', 'como esta', 'como voce esta',
  'podemos confirmar', 'posso confirmar', 'precisa confirmar', 'favor confirmar', 'para confirmar',
  'confirmar', 'confirmando', 'confirmada', 'confirmado', 'confirmacao',
  'bom dia', 'boa tarde', 'boa noite', 'ola', 'oi',
  'dr', 'dra', 'doutor', 'doutora', 'medico', 'medica', 'paciente', 'secretaria', 'assistente',
  'agendado', 'agendamento', 'consulta', 'horario', 'atendimento', 'sessao', 'procedimento',
  'obrigado', 'obrigada', 'muito obrigado', 'muito obrigada', 'grata', 'grato',
  'claro', 'perfeito', 'valeu', 'beleza', 'show', 'sim', 'nao', 'ok',
  'me chamo', 'sou assistente', 'eu tinha anotado', 'segue', 'segue sua nota', 'segue o comprovante',
  'estamos confirmando', 'voce', 'voces', 'temos', 'vamos', 'posso', 'pode', 'podemos',
  'quero', 'gostaria', 'aguardo', 'envio', 'comprovante', 'pagamento', 'reajuste'
]);

function ehTermoInvalidoNome(termo: string): boolean {
  const norm = termo.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
  if (TERMOS_INVALIDOS.has(norm)) return true;
  const partes = norm.split(/\s+/);
  if (partes.length === 1 && TERMOS_INVALIDOS.has(partes[0])) return true;
  return partes.some(p => ['tudo', 'bem', 'bom', 'podemos', 'confirmar', 'confirmando', 'dia', 'tarde', 'noite', 'ola', 'oi'].includes(p));
}
