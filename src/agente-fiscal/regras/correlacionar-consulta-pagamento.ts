/**
 * Regra pura de correlação contextual entre agendamento de consulta, comprovante de
 * pagamento e emissões anteriores no histórico do WhatsApp. Isola 100% da decisão
 * sem I/O ou chamadas de rede.
 */

import {
  obterPagamentoDocumental,
  obterNotaFiscalDocumental,
  associarNotaPagamento,
  chavePagamento,
  inicioJanelaPagamentosBrasilia,
  diaBrasilia,
  type PagamentoDocumental
} from './evidencias-documentais.js';
import { extrairContextoConsultaConversa } from './extrair-contexto-consulta-conversa.js';
import { extrairCpfConversaSegura } from '../../paciente/extrair-cpf-texto.js';
import { validarCpf } from '../../paciente/validar-cpf.js';

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
  pacienteCpf?: string | null;
  valorCentavos: number;
  valorFormatado: string;
  dataConsulta: string;
  dataConsultaIso: string;
  confiancaData?: 'alta' | 'media' | 'baixa';
  dataAmbigua?: boolean;
  temEmissaoAnteriorNaConversa?: boolean;
  quantidadeEmissoesAnteriores?: number;
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
  _valorPadraoCentavos?: number,
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
  const pagamentos = ordenadas
    .map(mensagem => ({ mensagem, pagamento: obterPagamentoDocumental(mensagem) }))
    .filter((p): p is { mensagem: MensagemContextoConversa; pagamento: PagamentoDocumental } => p.pagamento !== null);
  const notas = ordenadas
    .map(mensagem => ({ mensagem, nota: obterNotaFiscalDocumental(mensagem) }))
    .filter(n => n.nota !== null);
  const corteCivil = dataCortePagamento ? new Date(`${diaBrasilia(dataCortePagamento)}T00:00:00-03:00`).getTime() : 0;
  const inicioJanela = corteCivil > 0 ? corteCivil : inicioJanelaPagamentosBrasilia(dataReferencia).getTime();
  const cpfConversa = extrairCpfConversaSegura(ordenadas);

  for (const { mensagem: msgAtual, pagamento } of pagamentos) {
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
    const contextoConsulta = extrairContextoConsultaConversa(
      mensagensAnteriores,
      msgAtual,
      nomeCadastro,
      dataReferencia,
      pagamento.dataConsultaReferencia
    );

    if (!contextoConsulta.mensagemId && !pagamento.dataConsultaReferencia) {
      motivosRevisao.push('Data da consulta não confirmada na conversa.');
    }
    if (contextoConsulta.nomePaciente === 'Paciente') motivosRevisao.push('Nome do paciente não confirmado.');
    const valorFormatado = `${Math.floor(pagamento.valorCentavos / 100)},${String(pagamento.valorCentavos % 100).padStart(2, '0')}`;
    const cpfCandidato = pagamento.pagadorDocumento && validarCpf(pagamento.pagadorDocumento)
      ? pagamento.pagadorDocumento
      : cpfConversa;
    const confiancaData: 'alta' | 'media' | 'baixa' = contextoConsulta.mensagemId || pagamento.dataConsultaReferencia
      ? 'alta'
      : (contextoConsulta.dataConsultaFormatada ? 'media' : 'baixa');

    candidatos.push({
      pacienteNome: contextoConsulta.nomePaciente,
      pacienteTelefone: limparTelefone(contatoTelefone),
      pacienteCpf: cpfCandidato,
      valorCentavos: pagamento.valorCentavos,
      valorFormatado,
      dataConsulta: contextoConsulta.dataConsultaFormatada,
      dataConsultaIso: contextoConsulta.dataConsultaIso,
      confiancaData,
      dataAmbigua: false,
      temEmissaoAnteriorNaConversa: notas.length > 0,
      quantidadeEmissoesAnteriores: notas.length,
      dataPagamento: pagamento.dataPagamento,
      identidadePagamento: identidade,
      documentoHash: pagamento.documentoHash,
      pagadorNome: pagamento.pagadorNome,
      pagadorDocumento: pagamento.pagadorDocumento,
      favorecidoNome: pagamento.favorecidoNome,
      favorecidoDocumento: pagamento.favorecidoDocumento,
      requerRevisao: motivosRevisao.length > 0,
      motivosRevisao,
      origemEvidencia: {
        mensagemPagamentoId: msgAtual.id,
        mensagemConsultaId: contextoConsulta.mensagemId,
        trechoPagamento: `Pagamento realizado de R$ ${valorFormatado} em ${pagamento.dataPagamento}`,
        trechoConsulta: contextoConsulta.trecho
      }
    });
  }
  return candidatos;
}

function limparTelefone(tel: string): string {
  const limpo = tel.replace(/\D/g, '');
  if (limpo.startsWith('55') && limpo.length >= 12) {
    return limpo.slice(2);
  }
  return limpo;
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
