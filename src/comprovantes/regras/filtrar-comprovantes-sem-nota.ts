/**
 * Regra pura de identificação cronológica de comprovantes sem nota fiscal.
 * 1. Respeita a data de corte informada pelo médico (janela temporal de busca);
 * 2. Considera apenas comprovantes que sucedem a última nota fiscal emitida no chat;
 * 3. Valida para emissão os comprovantes que NÃO possuem envio posterior de PDF de nota.
 */

import type { DadosComprovanteExtraidos } from '../../io/nvidia/paligemma-comprovante-client.js';

export interface MensagemHistoricoConversa {
  id: string;
  timestamp: Date | number | string;
  fromMe: boolean;
  tipo: 'texto' | 'imagem' | 'documento' | 'outro';
  nomeArquivo?: string | null;
  mimetype?: string | null;
  texto?: string | null;
  comprovante?: DadosComprovanteExtraidos | null;
}

export interface ComprovantePendenteEmissao {
  mensagemId: string;
  timestamp: number;
  valorCentavos: number;
  valorFormatado: string;
  dataPagamento: string;
  pagadorNome?: string;
  favorecidoNome?: string;
  transacaoId?: string;
}

export function ehDocumentoPdfNotaFiscal(msg: MensagemHistoricoConversa): boolean {
  if (msg.tipo !== 'documento') return false;
  const mime = (msg.mimetype || '').toLowerCase();
  const nome = (msg.nomeArquivo || '').toLowerCase();
  const texto = (msg.texto || '').toLowerCase();

  const ehPdf = mime.includes('pdf') || nome.endsWith('.pdf');
  if (!ehPdf) return false;

  const padraoNota = /nfs-?e|danfse|danfe|nota\s*fiscal|recibo\s*fiscal/i;
  return padraoNota.test(nome) || padraoNota.test(texto);
}

function normalizarTimestamp(ts: Date | number | string): number {
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'number') return ts;
  const d = new Date(ts);
  return Number.isFinite(d.getTime()) ? d.getTime() : 0;
}

export function filtrarComprovantesSemNota(
  mensagens: MensagemHistoricoConversa[],
  dataCorte?: Date | number | string
): ComprovantePendenteEmissao[] {
  const tsCorte = dataCorte ? normalizarTimestamp(dataCorte) : 0;

  // 1. Ordena cronologicamente crescente
  const ordenadas = [...mensagens]
    .map(m => ({ ...m, ts: normalizarTimestamp(m.timestamp) }))
    .filter(m => m.ts >= tsCorte)
    .sort((a, b) => a.ts - b.ts);

  if (!ordenadas.length) return [];

  // 2. Encontra o timestamp da última nota fiscal enviada na conversa
  let tsUltimaNota = 0;
  for (const m of ordenadas) {
    if (ehDocumentoPdfNotaFiscal(m)) {
      if (m.ts > tsUltimaNota) {
        tsUltimaNota = m.ts;
      }
    }
  }

  // 3. Seleciona comprovantes válidos
  const comprovantesPendentes: ComprovantePendenteEmissao[] = [];

  for (let i = 0; i < ordenadas.length; i++) {
    const atual = ordenadas[i];
    const comp = atual.comprovante;

    // Apenas mensagens reconhecidas como comprovantes válidos
    if (!comp || !comp.ehComprovante || !comp.valorCentavos || comp.valorCentavos <= 0) {
      continue;
    }

    // Regra: comprovante deve suceder a última nota fiscal já enviada
    // (não emitir a partir de comprovantes antigos anteriores à última nota)
    if (tsUltimaNota > 0 && atual.ts <= tsUltimaNota) {
      continue;
    }

    // Verifica se após este comprovante houve algum envio posterior de PDF de nota fiscal
    const existeNotaPosterior = ordenadas.slice(i + 1).some(m => ehDocumentoPdfNotaFiscal(m));
    if (existeNotaPosterior) {
      continue;
    }

    comprovantesPendentes.push({
      mensagemId: atual.id,
      timestamp: atual.ts,
      valorCentavos: comp.valorCentavos,
      valorFormatado: comp.valorFormatado || (comp.valorCentavos / 100).toFixed(2),
      dataPagamento: comp.dataPagamento || new Date(atual.ts).toISOString().slice(0, 10),
      pagadorNome: comp.pagadorNome,
      favorecidoNome: comp.favorecidoNome,
      transacaoId: comp.transacaoId
    });
  }

  return comprovantesPendentes;
}
