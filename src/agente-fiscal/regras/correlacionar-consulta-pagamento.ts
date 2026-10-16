/**
 * Regra pura de correlação contextual entre agendamento de consulta, comprovante de
 * pagamento e emissões anteriores no histórico do WhatsApp. Isola 100% da decisão
 * sem I/O ou chamadas de rede.
 */

import {
  inferirDataConsultaHistorico,
  type ResultadoInferirDataConsulta
} from '../../emissao/regras/inferir-data-consulta-historico.js';
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
  _dataReferencia: Date = new Date(),
  valorPadraoCentavos?: number,
  dataCortePagamento?: Date
): CandidatoNotaFiscal[] {
  if (!mensagens || mensagens.length === 0) return [];

  const ordenadas = [...mensagens].sort((a, b) => {
    const tA = a.criadoEm instanceof Date ? a.criadoEm.getTime() : new Date(a.criadoEm).getTime();
    const tB = b.criadoEm instanceof Date ? b.criadoEm.getTime() : new Date(b.criadoEm).getTime();
    return tA - tB;
  });

  const infoGlobal = extrairMetadadosGlobaisConversa(ordenadas);
  const candidatos: CandidatoNotaFiscal[] = [];

  for (let i = 0; i < ordenadas.length; i++) {
    const msgAtual = ordenadas[i];
    const dataMsgAtual = msgAtual.criadoEm instanceof Date ? msgAtual.criadoEm : new Date(msgAtual.criadoEm);

    if (dataCortePagamento && dataMsgAtual.getTime() < dataCortePagamento.getTime()) {
      continue;
    }

    const mensagensAnteriores = ordenadas.slice(0, i);
    const mensagensPosteriores = ordenadas.slice(i + 1);
    const dadosPagamento = extrairDadosPagamento(msgAtual, mensagensAnteriores, valorPadraoCentavos);
    if (!dadosPagamento) continue;

    if (foiFaturadoPosteriormente(msgAtual, mensagensPosteriores)) {
      continue;
    }

    const dataInf: ResultadoInferirDataConsulta = inferirDataConsultaHistorico({
      mensagensAnteriores,
      msgPagamento: msgAtual,
      mensagensPosteriores
    });

    const nomePaciente =
      dadosPagamento.pagadorNome ||
      infoGlobal.nomeTomadorNotaAnterior ||
      extrairNomePacienteHistorico(mensagensAnteriores, nomeCadastro);

    candidatos.push({
      pacienteNome: nomePaciente,
      pacienteTelefone: limparTelefone(contatoTelefone),
      pacienteCpf: dadosPagamento.pagadorCpf || infoGlobal.cpfConversa,
      valorCentavos: dadosPagamento.valorCentavos,
      valorFormatado: dadosPagamento.valorFormatado,
      dataConsulta: dataInf.dataConsultaFormatada,
      dataConsultaIso: dataInf.dataConsultaIso,
      confiancaData: dataInf.confianca,
      dataAmbigua: dataInf.ambiguo,
      temEmissaoAnteriorNaConversa: infoGlobal.quantidadeNotasEnviadas > 0,
      quantidadeEmissoesAnteriores: infoGlobal.quantidadeNotasEnviadas,
      origemEvidencia: {
        mensagemPagamentoId: msgAtual.id,
        mensagemConsultaId: dataInf.mensagemId,
        trechoPagamento: dadosPagamento.trecho,
        trechoConsulta: dataInf.trecho
      }
    });
  }

  return candidatos;
}

interface DadosPagamentoDetectados {
  valorCentavos: number;
  valorFormatado: string;
  trecho: string;
  pagadorCpf?: string | null;
  pagadorNome?: string | null;
}

function extrairDadosPagamento(
  msg: MensagemContextoConversa,
  mensagensAnteriores: MensagemContextoConversa[] = [],
  valorPadraoCentavos?: number
): DadosPagamentoDetectados | null {
  if (msg.direcao === 'enviada') return null;
  if (msg.tipo !== 'imagem' && msg.tipo !== 'documento') return null;

  const comp = msg.payloadBruto?.comprovante as Record<string, any> | undefined;
  if (comp) {
    if (!comp.ehComprovante || comp.ehNotaFiscal) return null;

    const valorCentavos =
      (typeof comp.valorCentavos === 'number' && comp.valorCentavos > 0 ? comp.valorCentavos : undefined) ??
      buscarValorNasMensagensAnteriores(mensagensAnteriores) ??
      (valorPadraoCentavos && valorPadraoCentavos > 0 ? valorPadraoCentavos : undefined);

    if (!valorCentavos || valorCentavos <= 0) return null;

    const valorFormatado = formatarCentavosBr(valorCentavos);
    const cpfComp = limparCpfValido(comp.pagadorCpf || comp.tomadorCpf);
    const nomeComp = limparNomeContato(comp.pagadorNome);

    return {
      valorCentavos,
      valorFormatado,
      trecho: `Comprovante bancário ${comp.tipo || 'Pix'} de R$ ${valorFormatado}`,
      pagadorCpf: cpfComp,
      pagadorNome: nomeComp || null
    };
  }

  return extrairFallbackSemVlm(mensagensAnteriores, valorPadraoCentavos);
}

function extrairFallbackSemVlm(
  mensagensAnteriores: MensagemContextoConversa[],
  valorPadraoCentavos?: number
): DadosPagamentoDetectados | null {
  const houveContexto = mensagensAnteriores.some(
    m => m.direcao === 'enviada' && /\b(?:pix|comprovante|pagamento|consulta|confirmando|hor[aá]rio)\b/i.test(m.conteudo || '')
  );
  if (!houveContexto) return null;

  const valorDoChat = buscarValorNasMensagensAnteriores(mensagensAnteriores);
  const valorFinal = valorDoChat ?? (valorPadraoCentavos && valorPadraoCentavos > 0 ? valorPadraoCentavos : undefined);
  if (!valorFinal || valorFinal <= 0) return null;

  const valorFormatado = formatarCentavosBr(valorFinal);
  const sufixo = valorDoChat ? '' : ' (valor padrão)';
  return {
    valorCentavos: valorFinal,
    valorFormatado,
    trecho: `Comprovante Pix de R$ ${valorFormatado}${sufixo}`
  };
}

function buscarValorNasMensagensAnteriores(mensagensAnteriores: MensagemContextoConversa[]): number | undefined {
  for (let j = mensagensAnteriores.length - 1; j >= 0; j--) {
    const t = mensagensAnteriores[j].conteudo || '';
    const mValor =
      t.match(/(?:r\$\s*|valor(?:\s*da\s*consulta)?\s*(?:é|e|de)?\s*:?\s*)(\d{2,4})(?:[,\.](\d{2}))?/i) ||
      t.match(/\b(\d{2,4}),(\d{2})\b/) ||
      t.match(/\b(\d{2,4})\s*reais\b/i);
    if (mValor) {
      const reais = parseInt(mValor[1].replace(/\./g, ''), 10);
      const centavos = mValor[2] ? parseInt(mValor[2], 10) : 0;
      return reais * 100 + centavos;
    }
  }
  return undefined;
}

function extrairMetadadosGlobaisConversa(ordenadas: MensagemContextoConversa[]): {
  cpfConversa: string | null;
  nomeTomadorNotaAnterior: string | null;
  quantidadeNotasEnviadas: number;
} {
  let cpfMidia: string | null = null;
  let nomeTomadorNotaAnterior: string | null = null;
  let quantidadeNotasEnviadas = 0;

  for (const m of ordenadas) {
    if (ehMensagemDeNotaFiscalEnviada(m)) {
      quantidadeNotasEnviadas += 1;
    }
    const comp = m.payloadBruto?.comprovante as Record<string, any> | undefined;
    if (comp) {
      const cpfCand = limparCpfValido(comp.tomadorCpf || comp.pagadorCpf);
      if (cpfCand && !cpfMidia) cpfMidia = cpfCand;
      const nomeCand = limparNomeContato(comp.tomadorNome);
      if (nomeCand && !nomeTomadorNotaAnterior) nomeTomadorNotaAnterior = nomeCand;
    }
  }

  const cpfTexto = extrairCpfConversaSegura(
    ordenadas.map(m => ({ direcao: m.direcao, texto: m.conteudo }))
  );

  return {
    cpfConversa: cpfMidia || cpfTexto,
    nomeTomadorNotaAnterior,
    quantidadeNotasEnviadas
  };
}

function extrairNomePacienteHistorico(
  mensagensAnteriores: MensagemContextoConversa[],
  nomeCadastro?: string | null
): string {
  const doCadastro = limparNomeContato(nomeCadastro);
  if (doCadastro) return doCadastro;

  for (let i = mensagensAnteriores.length - 1; i >= 0; i--) {
    const msg = mensagensAnteriores[i];
    if (msg.direcao !== 'enviada' || !msg.conteudo) continue;
    const match = msg.conteudo.match(
      /(?:bom\s+dia|boa\s+tarde|boa\s+noite|ol[áa]|oi),?\s*\*?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)?)\*?(?:,|\s+tudo\s+bem|\s+como\s+vai|\.|\!|\?|\s+voc[êe]|\s+pode|\s+obrigad|\s+estamos|\n|$)/i
    );
    if (match && match[1].length >= 3) {
      const cand = match[1].trim();
      if (!ehTermoInvalidoNome(cand)) return cand;
    }
  }
  return 'Paciente';
}

export function foiFaturadoPosteriormente(
  msgPagamento: MensagemContextoConversa,
  mensagensPosteriores: MensagemContextoConversa[]
): boolean {
  if (!mensagensPosteriores || mensagensPosteriores.length === 0) return false;

  const dataPagamento = msgPagamento.criadoEm instanceof Date
    ? msgPagamento.criadoEm.getTime()
    : new Date(msgPagamento.criadoEm).getTime();

  const LIMITE_DIAS_FATURAMENTO_MS = 45 * 24 * 60 * 60 * 1000;

  for (const msg of mensagensPosteriores) {
    const dataMsg = msg.criadoEm instanceof Date ? msg.criadoEm.getTime() : new Date(msg.criadoEm).getTime();
    if (dataMsg - dataPagamento > LIMITE_DIAS_FATURAMENTO_MS) break;

    if (ehNovoCicloDePagamentoDoPaciente(msgPagamento, msg, dataPagamento, dataMsg)) {
      break;
    }

    if (ehMensagemDeNotaFiscalEnviada(msg)) {
      return true;
    }
  }

  return false;
}

function ehNovoCicloDePagamentoDoPaciente(
  msgPagamentoOriginal: MensagemContextoConversa,
  msgPosterior: MensagemContextoConversa,
  tsOriginal: number,
  tsPosterior: number
): boolean {
  if (msgPosterior.direcao !== 'recebida') return false;

  const compPosterior = msgPosterior.payloadBruto?.comprovante as Record<string, any> | undefined;
  if (compPosterior && compPosterior.ehComprovante === false) {
    return false;
  }

  const txOriginal = (msgPagamentoOriginal.payloadBruto?.comprovante as any)?.idTransacao;
  const txPosterior = compPosterior?.idTransacao;
  if (txOriginal && txPosterior && txOriginal !== txPosterior) {
    return true;
  }

  const intervaloMinimoNovoPagamentoMs = 6 * 60 * 60 * 1000; // 6 horas
  if (tsPosterior - tsOriginal < intervaloMinimoNovoPagamentoMs) {
    return false;
  }

  if (compPosterior?.ehComprovante === true) return true;
  if (msgPosterior.tipo === 'imagem' || msgPosterior.tipo === 'documento') return true;

  return false;
}

function ehMensagemDeNotaFiscalEnviada(msg: MensagemContextoConversa): boolean {
  if (msg.direcao !== 'enviada') return false;
  const texto = (msg.conteudo || '').trim();
  if (padraoNotaFiscalTexto(texto)) return true;

  if (msg.tipo === 'documento') {
    const comp = msg.payloadBruto?.comprovante as Record<string, any> | undefined;
    if (comp?.ehNotaFiscal === true) return true;

    const payloadMsg = (msg.payloadBruto as any)?.message;
    const payloadDoc =
      payloadMsg?.documentMessage ||
      payloadMsg?.documentWithCaptionMessage?.message?.documentMessage;
    const nomeArquivo = (payloadDoc?.fileName || payloadDoc?.title || '').trim();
    const legenda = (payloadDoc?.caption || '').trim();

    return padraoNotaFiscalDocumento(nomeArquivo, legenda);
  }
  return false;
}

function padraoNotaFiscalTexto(texto: string): boolean {
  if (!texto) return false;
  return /(?:(?:sua|a|as|esta)\s+nota(?:s)?(?:\s+fiscal|\s+fiscais)?|sua\s+nf|segue\s+(?:sua\s+|a\s+)?(?:nota|nf)|nota\s+fiscal|danfse|nfse|nfs-e)/i.test(
    texto
  );
}

function padraoNotaFiscalDocumento(nomeArquivo: string, legenda: string): boolean {
  const combinado = `${nomeArquivo} ${legenda}`.trim();
  if (/\b(?:receita|receitu[aá]rio|atestado|exame|laudo|prescri[cç][aã]o|encaminhamento|relat[oó]rio|orienta[cç][oõ]es|pedido|guia)\b/i.test(combinado)) {
    return false;
  }
  if (padraoNotaFiscalTexto(nomeArquivo) || padraoNotaFiscalTexto(legenda)) return true;
  if (/\b\d{40,50}\b/.test(nomeArquivo)) return true;
  if (/\.pdf$/i.test(nomeArquivo)) return true;
  return false;
}

function formatarCentavosBr(valorCentavos: number): string {
  const reais = Math.floor(valorCentavos / 100);
  const centavos = valorCentavos % 100;
  return `${reais},${String(centavos).padStart(2, '0')}`;
}

function limparTelefone(tel: string): string {
  const limpo = tel.replace(/\D/g, '');
  return limpo.startsWith('55') && limpo.length >= 12 ? limpo.slice(2) : limpo;
}

function limparCpfValido(cpf?: unknown): string | null {
  if (typeof cpf !== 'string') return null;
  const digitos = cpf.replace(/\D/g, '');
  return digitos.length === 11 && validarCpf(digitos) ? digitos : null;
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
  const norm = termo.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();
  if (TERMOS_INVALIDOS_NOME.has(norm)) return true;
  const partes = norm.split(/\s+/);
  if (partes.length === 1 && TERMOS_INVALIDOS_NOME.has(partes[0])) return true;
  return partes.some(p =>
    ['tudo', 'bem', 'bom', 'podemos', 'confirmar', 'confirmando', 'dia', 'tarde', 'noite', 'ola', 'oi'].includes(p)
  );
}


