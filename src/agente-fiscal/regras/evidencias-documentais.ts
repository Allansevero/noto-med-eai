import type { MensagemContextoConversa } from './correlacionar-consulta-pagamento.js';
import { validarComprovanteCache, type DadosNotaFiscalExtraidos } from '../../io/nvidia/paligemma-comprovante-client.js';

export interface PagamentoDocumental {
  valorCentavos: number;
  dataPagamento: string;
  instantePagamento: number;
  transacaoId?: string;
  documentoHash?: string;
  pagadorNome?: string;
  pagadorDocumento?: string;
  favorecidoNome?: string;
  favorecidoDocumento?: string;
}

const registro = (valor: unknown): Record<string, unknown> | undefined =>
  valor !== null && typeof valor === 'object' && !Array.isArray(valor)
    ? valor as Record<string, unknown> : undefined;
const texto = (valor: unknown): string | undefined =>
  typeof valor === 'string' && valor.trim() ? valor.trim() : undefined;
export const normalizarIdentidade = (valor?: string): string =>
  (valor ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Dia civil brasileiro, independente do fuso configurado no processo. */
export function diaBrasilia(data: Date): string {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(data);
  const campo = (tipo: string) => partes.find(p => p.type === tipo)?.value;
  return `${campo('year')}-${campo('month')}-${campo('day')}`;
}

/** Quinze dias civis inclusivos: hoje e os quatorze dias anteriores. */
export function inicioJanelaPagamentosBrasilia(referencia: Date): Date {
  const dia = new Date(`${diaBrasilia(referencia)}T12:00:00Z`);
  dia.setUTCDate(dia.getUTCDate() - 14);
  // Brasília não adota horário de verão na janela contemporânea do produto.
  return new Date(`${dia.toISOString().slice(0, 10)}T00:00:00-03:00`);
}

/** Aceita caches antigos com campos suficientes; ausência de status requer nova extração. */
export function obterPagamentoDocumental(msg: MensagemContextoConversa): PagamentoDocumental | null {
  if (msg.direcao !== 'recebida' || !['imagem', 'documento'].includes(msg.tipo)) return null;
  const comp = validarComprovanteCache(msg.payloadBruto?.comprovante);
  if (!comp || comp.ehComprovante !== true || comp.statusPagamento !== 'realizado') return null;
  const valor = comp.valorCentavos;
  const data = texto(comp.dataPagamento);
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor <= 0 || !data) return null;
  // Datas sem horário representam o início do dia em Brasília, não meia-noite UTC.
  if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))?$/.test(data)) return null;
  const instante = Date.parse(data.length === 10 ? `${data}T00:00:00-03:00` : data);
  const dia = Date.parse(data.slice(0, 10));
  if (!Number.isFinite(instante) || !Number.isFinite(dia) || new Date(dia).toISOString().slice(0, 10) !== data.slice(0, 10)) return null;
  return {
    valorCentavos: valor, dataPagamento: data, instantePagamento: instante,
    transacaoId: texto(comp.transacaoId), documentoHash: texto(comp.documentoHash),
    pagadorNome: texto(comp.pagadorNome), pagadorDocumento: texto(comp.pagadorDocumento),
    favorecidoNome: texto(comp.favorecidoNome), favorecidoDocumento: texto(comp.favorecidoDocumento)
  };
}

export function obterNotaFiscalDocumental(msg: MensagemContextoConversa): DadosNotaFiscalExtraidos | null {
  if (msg.direcao !== 'enviada' || !['imagem', 'documento'].includes(msg.tipo)) return null;
  const comp = registro(msg.payloadBruto?.comprovante);
  const nf = registro(msg.payloadBruto?.notaFiscal) ?? registro(comp?.notaFiscal);
  if (!nf || nf.ehNotaFiscal !== true || nf.status !== 'emitida') return null;
  const valor = nf.valorCentavos;
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor <= 0) return null;
  if (!texto(nf.numero) && !texto(nf.chaveAcesso)) return null;
  if (!texto(nf.prestadorNome) || (!texto(nf.tomadorNome) && !texto(nf.tomadorDocumento))) return null;
  return {
    ehNotaFiscal: true, status: 'emitida', valorCentavos: valor,
    numero: texto(nf.numero), chaveAcesso: texto(nf.chaveAcesso),
    tomadorNome: texto(nf.tomadorNome), tomadorDocumento: texto(nf.tomadorDocumento),
    prestadorNome: texto(nf.prestadorNome), referenciaPagamento: texto(nf.referenciaPagamento),
    dataEmissao: texto(nf.dataEmissao)
  };
}

/** Forte = referência explícita, ou valor + identidade; valor isolado é ambíguo. */
export function associarNotaPagamento(nota: DadosNotaFiscalExtraidos, pagamento: PagamentoDocumental): 'forte' | 'ambiguo' | 'nenhum' {
  const comparar = (a?: string, b?: string) => a && b
    ? normalizarIdentidade(a) === normalizarIdentidade(b) : undefined;
  const referencia = comparar(nota.referenciaPagamento, pagamento.transacaoId);
  const documentoCompleto = (valor?: string): string | undefined => {
    if (!valor || /[*xX]/.test(valor)) return undefined;
    const digitos = valor.replace(/\D/g, '');
    return [11, 14].includes(digitos.length) ? digitos : undefined;
  };
  const documento = comparar(documentoCompleto(nota.tomadorDocumento), documentoCompleto(pagamento.pagadorDocumento));
  const nome = comparar(nota.tomadorNome, pagamento.pagadorNome);
  const favorecido = comparar(nota.prestadorNome, pagamento.favorecidoNome);
  if (referencia === false || documento === false) return 'nenhum';
  if (nota.valorCentavos !== pagamento.valorCentavos) return referencia === true ? 'ambiguo' : 'nenhum';
  if (referencia === true) return 'forte';
  if (favorecido === false) return 'ambiguo';
  if (documento === true || nome === true) return 'forte';
  // Pagador e tomador podem ser pessoas distintas; nunca deduz emissão só pelo valor.
  return 'ambiguo';
}

export function chavePagamento(pagamento: PagamentoDocumental, mensagemId: string): string {
  if (pagamento.transacaoId) return `transacao:${pagamento.transacaoId}`;
  if (pagamento.documentoHash) return `documento:${pagamento.documentoHash}`;
  return `mensagem:${mensagemId}`;
}
