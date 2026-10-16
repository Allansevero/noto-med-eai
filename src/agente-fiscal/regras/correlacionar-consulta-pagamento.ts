/**
 * Regra pura de correlação contextual entre agendamento de consulta e pagamento.
 * Identifica comprovantes/pagamentos na conversa e busca nas mensagens anteriores
 * a data em que o atendimento foi agendado ou realizado, além do nome do paciente.
 * Isola 100% da lógica sem I/O ou chamadas de rede.
 */

import { obterPagamentoDocumental, obterNotaFiscalDocumental, associarNotaPagamento, chavePagamento, inicioJanelaPagamentosBrasilia, diaBrasilia, type PagamentoDocumental } from './evidencias-documentais.js';
import { extrairDatasConsulta } from '../../emissao/regras/extrair-datas-consulta.js';

export interface MensagemContextoConversa {
  id: string;
  direcao: 'enviada' | 'recebida';
  tipo: 'texto' | 'imagem' | 'documento' | 'outro';
  conteudo?: string | null;
  criadoEm: Date | string | number;
  payloadBruto?: Record<string, unknown> | null;
}

export interface CandidatoNotaFiscal {
  pacienteNome: string;
  pacienteTelefone: string;
  valorCentavos: number;
  valorFormatado: string;
  dataConsulta: string;
  dataConsultaIso: string;
  dataPagamento?: string;
  identidadePagamento?: string;
  documentoHash?: string;
  pagadorNome?: string;
  pagadorDocumento?: string;
  favorecidoNome?: string;
  favorecidoDocumento?: string;
  requerRevisao?: boolean;
  motivosRevisao?: string[];
  origemEvidencia: {
    mensagemPagamentoId: string;
    mensagemConsultaId?: string;
    trechoPagamento: string;
    trechoConsulta?: string;
  };
}

export function correlacionarConsultaPagamento(
  mensagens: MensagemContextoConversa[],
  contatoTelefone: string,
  nomeCadastro?: string | null,
  dataReferencia: Date = new Date(),
  valorPadraoCentavos?: number,
  dataCortePagamento?: Date
): CandidatoNotaFiscal[] {
  if (!mensagens || mensagens.length === 0) return [];

  const ordenadas = [...mensagens].sort((a, b) => {
    const tA = a.criadoEm instanceof Date ? a.criadoEm.getTime() : new Date(a.criadoEm).getTime();
    const tB = b.criadoEm instanceof Date ? b.criadoEm.getTime() : new Date(b.criadoEm).getTime();
    return tA - tB;
  });

  const candidatos: CandidatoNotaFiscal[] = [];
  const vistos = new Set<string>();
  const pagamentos = ordenadas.map(mensagem => ({ mensagem, pagamento: obterPagamentoDocumental(mensagem) }))
    .filter((p): p is { mensagem: MensagemContextoConversa; pagamento: PagamentoDocumental } => p.pagamento !== null);
  const notas = ordenadas.map(mensagem => ({ mensagem, nota: obterNotaFiscalDocumental(mensagem) }))
    .filter(n => n.nota !== null);
  const corteCivil = dataCortePagamento ? new Date(`${diaBrasilia(dataCortePagamento)}T00:00:00-03:00`).getTime() : 0;
  const inicioJanela = Math.max(inicioJanelaPagamentosBrasilia(dataReferencia).getTime(), corteCivil);

  for (const { mensagem: msgAtual, pagamento } of pagamentos) {
    // A janela usa a data efetiva do documento, nunca o recebimento da mensagem.
    if (pagamento.instantePagamento < inicioJanela || pagamento.instantePagamento > dataReferencia.getTime()) continue;
    const identidade = chavePagamento(pagamento, msgAtual.id);
    if (vistos.has(identidade)) continue;
    vistos.add(identidade);

    let faturado = false;
    const motivosRevisao: string[] = [];
    const repetidos = pagamentos.filter(p => chavePagamento(p.pagamento, p.mensagem.id) === identidade);
    if (repetidos.some(p => p.pagamento.valorCentavos !== pagamento.valorCentavos ||
      p.pagamento.dataPagamento !== pagamento.dataPagamento)) {
      motivosRevisao.push('Documentos com a mesma identificação apresentam dados de pagamento divergentes.');
    }
    for (const { mensagem: msgNota, nota } of notas) {
      if (!nota || new Date(msgNota.criadoEm).getTime() < pagamento.instantePagamento) continue;
      const associacao = associarNotaPagamento(nota, pagamento);
      if (associacao === 'nenhum') continue;
      const relacionados = new Set(pagamentos.filter(p =>
        p.pagamento.instantePagamento <= new Date(msgNota.criadoEm).getTime() &&
        associarNotaPagamento(nota, p.pagamento) !== 'nenhum'
      ).map(p => chavePagamento(p.pagamento, p.mensagem.id)));
      if (associacao === 'forte' && relacionados.size === 1) faturado = true;
      else motivosRevisao.push('Há NFS-e enviada com associação ambígua ao pagamento.');
    }
    if (faturado) continue;
    const mensagensAnteriores = ordenadas.filter(m => new Date(m.criadoEm).getTime() < new Date(msgAtual.criadoEm).getTime());
    const contextoConsulta = extrairContextoConsultaAnterior(mensagensAnteriores, msgAtual, nomeCadastro, dataReferencia);
    if (!contextoConsulta.mensagemId) motivosRevisao.push('Data da consulta não confirmada na conversa.');
    if (contextoConsulta.nomePaciente === 'Paciente') motivosRevisao.push('Nome do paciente não confirmado.');
    const valorFormatado = `${Math.floor(pagamento.valorCentavos / 100)},${String(pagamento.valorCentavos % 100).padStart(2, '0')}`;
    candidatos.push({
      pacienteNome: contextoConsulta.nomePaciente,
      pacienteTelefone: limparTelefone(contatoTelefone),
      valorCentavos: pagamento.valorCentavos, valorFormatado,
      dataConsulta: contextoConsulta.dataConsultaFormatada,
      dataConsultaIso: contextoConsulta.dataConsultaIso,
      dataPagamento: pagamento.dataPagamento, identidadePagamento: identidade,
      documentoHash: pagamento.documentoHash, pagadorNome: pagamento.pagadorNome,
      pagadorDocumento: pagamento.pagadorDocumento,
      favorecidoNome: pagamento.favorecidoNome, favorecidoDocumento: pagamento.favorecidoDocumento,
      requerRevisao: motivosRevisao.length > 0, motivosRevisao,
      origemEvidencia: {
        mensagemPagamentoId: msgAtual.id, mensagemConsultaId: contextoConsulta.mensagemId,
        trechoPagamento: `Pagamento realizado de R$ ${valorFormatado} em ${pagamento.dataPagamento}`,
        trechoConsulta: contextoConsulta.trecho
      }
    });
  }
  return candidatos;
}

interface ContextoConsultaDetectado {
  nomePaciente: string;
  dataConsultaFormatada: string;
  dataConsultaIso: string;
  mensagemId?: string;
  trecho?: string;
}

function extrairContextoConsultaAnterior(
  mensagensAnteriores: MensagemContextoConversa[],
  msgPagamento: MensagemContextoConversa,
  nomeCadastro: string | null | undefined,
  agora: Date
): ContextoConsultaDetectado {
  let nomeEncontrado = limparNomeContato(nomeCadastro);
  let dataConsultaFormatada = '';
  let dataConsultaIso = '';
  let mensagemId: string | undefined;
  let trecho: string | undefined;

  // Percorre as mensagens anteriores de trás para frente (da mais recente para a mais antiga)
  for (let i = mensagensAnteriores.length - 1; i >= 0; i--) {
    const msg = mensagensAnteriores[i];
    const texto = msg.conteudo || '';

    // Extrair nome quando a mensagem enviada pela clínica se dirige ao paciente pelo nome
    if (!nomeEncontrado && msg.direcao === 'enviada') {
      const matchSaudacaoNome = texto.match(/(?:bom\s+dia|boa\s+tarde|boa\s+noite|ol[áa]|oi),?\s*\*?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\*?(?:,|\s+tudo\s+bem|\s+como\s+vai|\.|\!|\?|\s+voc[êe]|\s+pode|\s+obrigad|\s+estamos|\n|$)/i);
      if (matchSaudacaoNome && matchSaudacaoNome[1].length >= 3) {
        const cand = matchSaudacaoNome[1].trim();
        if (!ehTermoInvalidoNome(cand)) {
          nomeEncontrado = cand;
        }
      }
    }

    // Extrair data da consulta / agendamento
    if (!dataConsultaFormatada) {
      // Padrões comuns: "agendado para, *13/10/2026*", "consulta de 09/10/26", "retorno dia 08/10"
      const matchAgendamento = texto.match(/(?:agendad[oa]|procedimento|consulta|atendimento|sess[aã]o|retorno)\s*(?:para|de|em|dia)?,?\s*\*?(\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?)\*?/i);
      if (matchAgendamento) {
        const extraido = extrairDatasConsulta(matchAgendamento[1], new Date(msg.criadoEm));
        if (extraido.encontrou && extraido.datas.length > 0) {
          const d = extraido.datas[0];
          dataConsultaFormatada = formatarDataBr(d);
          dataConsultaIso = d.toISOString().slice(0, 10);
          mensagemId = msg.id;
          trecho = matchAgendamento[0];
        }
      } else {
        // Tentar qualquer data explícita ou relativa na mensagem se contiver termos clínicos
        if (/(?:agendad|hor[áa]rio|consulta|procedimento|retorno|m[ée]dic|dr)/i.test(texto)) {
          const extraido = extrairDatasConsulta(texto, new Date(msg.criadoEm));
          if (extraido.encontrou && extraido.datas.length > 0) {
            const d = extraido.datas[0];
            dataConsultaFormatada = formatarDataBr(d);
            dataConsultaIso = d.toISOString().slice(0, 10);
            mensagemId = msg.id;
            trecho = texto.slice(0, 100);
          }
        }
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

function formatarDataBr(d: Date): string {
  const dia = String(d.getDate()).padStart(2, '0');
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function limparTelefone(tel: string): string {
  const limpo = tel.replace(/\D/g, '');
  if (limpo.startsWith('55') && limpo.length >= 12) {
    return limpo.slice(2);
  }
  return limpo;
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

const TERMOS_INVALIDOS_NOME = new Set([
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
  const norm = termo
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .trim()
    .toLowerCase();
  if (TERMOS_INVALIDOS_NOME.has(norm)) return true;
  const partes = norm.split(/\s+/);
  if (partes.length === 1 && TERMOS_INVALIDOS_NOME.has(partes[0])) return true;
  if (partes.some(p => ['tudo', 'bem', 'bom', 'podemos', 'confirmar', 'confirmando', 'dia', 'tarde', 'noite', 'ola', 'oi'].includes(p))) {
    return true;
  }
  return false;
}

/** Somente uma NFS-e estruturada e inequivocamente associada prova faturamento. */
export function foiFaturadoPosteriormente(
  msgPagamento: MensagemContextoConversa,
  mensagensPosteriores: MensagemContextoConversa[]
): boolean {
  const pagamento = obterPagamentoDocumental(msgPagamento);
  if (!pagamento) return false;
  const outros = mensagensPosteriores.map(obterPagamentoDocumental).filter((p): p is PagamentoDocumental => p !== null);
  return mensagensPosteriores.some(msg => {
    const nota = obterNotaFiscalDocumental(msg);
    if (!nota || new Date(msg.criadoEm).getTime() < pagamento.instantePagamento || associarNotaPagamento(nota, pagamento) !== 'forte') return false;
    return !outros.some(p => chavePagamento(p, '') !== chavePagamento(pagamento, msgPagamento.id) &&
      p.instantePagamento <= new Date(msg.criadoEm).getTime() && associarNotaPagamento(nota, p) !== 'nenhum');
  });
}
