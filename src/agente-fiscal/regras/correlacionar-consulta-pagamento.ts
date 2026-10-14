/**
 * Regra pura de correlação contextual entre agendamento de consulta e pagamento.
 * Identifica comprovantes/pagamentos na conversa e busca nas mensagens anteriores
 * a data em que o atendimento foi agendado ou realizado, além do nome do paciente.
 * Isola 100% da lógica sem I/O ou chamadas de rede.
 */

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

  for (let i = 0; i < ordenadas.length; i++) {
    const msgAtual = ordenadas[i];
    const dataMsgAtual = msgAtual.criadoEm instanceof Date
      ? msgAtual.criadoEm
      : new Date(msgAtual.criadoEm);

    // Se o pagamento for anterior à data de corte da janela de faturamento, descarta como candidato a nota
    if (dataCortePagamento && dataMsgAtual.getTime() < dataCortePagamento.getTime()) {
      continue;
    }

    const mensagensAnteriores = ordenadas.slice(0, i);
    const dadosPagamento = extrairDadosPagamento(msgAtual, mensagensAnteriores, valorPadraoCentavos);
    if (!dadosPagamento) continue;

    // Se o pagamento já foi faturado (nota fiscal enviada em seguida), descarta este candidato
    const mensagensPosteriores = ordenadas.slice(i + 1);
    if (foiFaturadoPosteriormente(msgAtual, mensagensPosteriores)) {
      continue;
    }

    // Buscar no histórico ANTERIOR à mensagem de pagamento a data da consulta e o nome do paciente
    const contextoConsulta = extrairContextoConsultaAnterior(
      mensagensAnteriores,
      msgAtual,
      nomeCadastro,
      dataReferencia
    );

    candidatos.push({
      pacienteNome: contextoConsulta.nomePaciente,
      pacienteTelefone: limparTelefone(contatoTelefone),
      valorCentavos: dadosPagamento.valorCentavos,
      valorFormatado: dadosPagamento.valorFormatado,
      dataConsulta: contextoConsulta.dataConsultaFormatada,
      dataConsultaIso: contextoConsulta.dataConsultaIso,
      origemEvidencia: {
        mensagemPagamentoId: msgAtual.id,
        mensagemConsultaId: contextoConsulta.mensagemId,
        trechoPagamento: dadosPagamento.trecho,
        trechoConsulta: contextoConsulta.trecho
      }
    });
  }

  return candidatos;
}

interface DadosPagamentoDetectados {
  valorCentavos: number;
  valorFormatado: string;
  trecho: string;
}

function extrairDadosPagamento(
  msg: MensagemContextoConversa,
  mensagensAnteriores: MensagemContextoConversa[] = [],
  valorPadraoCentavos?: number
): DadosPagamentoDetectados | null {
  // 1. MENSAGEM DA CLÍNICA/SECRETÁRIA NUNCA É COMPROVANTE DE PAGAMENTO
  if (msg.direcao === 'enviada') {
    return null;
  }

  // 2. MENSAGENS DE TEXTO PURO NUNCA GERAM CANDIDATOS A EMISSÃO
  // Apenas comprovantes visuais (imagem ou PDF) atestam que o pagamento de fato ocorreu.
  if (msg.tipo === 'texto') {
    return null;
  }

  // 3. APENAS IMAGENS OU DOCUMENTOS (PDF) RECEBIDOS DO PACIENTE SÃO ELEGÍVEIS
  if (msg.tipo !== 'imagem' && msg.tipo !== 'documento') {
    return null;
  }

  // 4. VERIFICAÇÃO VISUAL PELO MODELO DE VISÃO COMPUTACIONAL (PaliGemma / VLM)
  const comp = msg.payloadBruto?.comprovante as Record<string, any> | undefined;

  if (comp) {
    // Se o modelo de visão determinou que NÃO é um comprovante (ex: exame de sangue, receita, raio-X)
    if (!comp.ehComprovante) {
      return null;
    }

    let valorCentavos = typeof comp.valorCentavos === 'number' && comp.valorCentavos > 0
      ? comp.valorCentavos
      : undefined;

    // Se o modelo confirmou que é comprovante bancário mas o valor na foto ficou ilegível,
    // correlaciona com o valor da consulta passado pela clínica nas mensagens anteriores
    if (!valorCentavos && mensagensAnteriores.length > 0) {
      for (let j = mensagensAnteriores.length - 1; j >= 0; j--) {
        const t = mensagensAnteriores[j].conteudo || '';
        const mValor = t.match(/(?:r\$\s*|valor(?:\s*da\s*consulta)?\s*(?:é|e|de)?\s*:?\s*)(\d{2,4})(?:[,\.](\d{2}))?/i) ||
                       t.match(/\b(\d{2,4}),(\d{2})\b/) ||
                       t.match(/\b(\d{2,4})\s*reais\b/i);
        if (mValor) {
          const reais = parseInt(mValor[1].replace(/\./g, ''), 10);
          const centavos = mValor[2] ? parseInt(mValor[2], 10) : 0;
          valorCentavos = reais * 100 + centavos;
          break;
        }
      }
    }

    // Fallback para valor padrão cadastrado do serviço fiscal
    if (!valorCentavos && valorPadraoCentavos && valorPadraoCentavos > 0) {
      valorCentavos = valorPadraoCentavos;
    }

    if (valorCentavos && valorCentavos > 0) {
      const reais = Math.floor(valorCentavos / 100);
      const centavos = valorCentavos % 100;
      const valorFormatado = `${reais},${String(centavos).padStart(2, '0')}`;
      return {
        valorCentavos,
        valorFormatado,
        trecho: `Comprovante bancário ${comp.tipo || 'Pix'} de R$ ${valorFormatado}`
      };
    }

    return null;
  }

  // 5. Fallback para comprovantes recebidos do paciente ainda não processados pelo VLM
  // Só considera candidato se houve prévio agendamento ou pedido de Pix pela clínica no chat
  if (mensagensAnteriores.length > 0) {
    const houvePedidoPixOuConsulta = mensagensAnteriores.some(m =>
      m.direcao === 'enviada' && /\b(?:pix|comprovante|pagamento|consulta|confirmando|hor[aá]rio)\b/i.test(m.conteudo || '')
    );

    if (houvePedidoPixOuConsulta) {
      let valorCentavosEncontrado: number | undefined;
      let trechoEncontrado = 'Comprovante Pix recebido';

      for (let j = mensagensAnteriores.length - 1; j >= 0; j--) {
        const t = mensagensAnteriores[j].conteudo || '';
        const mValor = t.match(/(?:r\$\s*|valor(?:\s*da\s*consulta)?\s*(?:é|e|de)?\s*:?\s*)(\d{2,4})(?:[,\.](\d{2}))?/i) ||
                       t.match(/\b(\d{2,4}),(\d{2})\b/) ||
                       t.match(/\b(\d{2,4})\s*reais\b/i);
        if (mValor) {
          const reais = parseInt(mValor[1].replace(/\./g, ''), 10);
          const centavos = mValor[2] ? parseInt(mValor[2], 10) : 0;
          valorCentavosEncontrado = reais * 100 + centavos;
          trechoEncontrado = `Comprovante Pix de R$ ${reais},${String(centavos).padStart(2, '0')}`;
          break;
        }
      }

      if (!valorCentavosEncontrado && valorPadraoCentavos && valorPadraoCentavos > 0) {
        valorCentavosEncontrado = valorPadraoCentavos;
        const reais = Math.floor(valorPadraoCentavos / 100);
        const centavos = valorPadraoCentavos % 100;
        trechoEncontrado = `Comprovante Pix de R$ ${reais},${String(centavos).padStart(2, '0')} (valor padrão)`;
      }

      if (valorCentavosEncontrado && valorCentavosEncontrado > 0) {
        const reais = Math.floor(valorCentavosEncontrado / 100);
        const centavos = valorCentavosEncontrado % 100;
        return {
          valorCentavos: valorCentavosEncontrado,
          valorFormatado: `${reais},${String(centavos).padStart(2, '0')}`,
          trecho: trechoEncontrado
        };
      }
    }
  }

  return null;
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
        const extraido = extrairDatasConsulta(matchAgendamento[1], agora);
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
          const extraido = extrairDatasConsulta(texto, agora);
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

  // Fallback para a data do próprio pagamento ou data da mensagem
  if (!dataConsultaFormatada) {
    const dataMsg = msgPagamento.criadoEm instanceof Date ? msgPagamento.criadoEm : new Date(msgPagamento.criadoEm);
    dataConsultaFormatada = formatarDataBr(dataMsg);
    dataConsultaIso = dataMsg.toISOString().slice(0, 10);
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

/**
 * Verifica se após a mensagem de pagamento há evidência de que a nota fiscal
 * já foi emitida e enviada ao paciente (ex: envio de documento PDF de NFS-e ou
 * mensagem dizendo "sua nota fiscal", "segue sua nota", etc.).
 */
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
    const dataMsg = msg.criadoEm instanceof Date
      ? msg.criadoEm.getTime()
      : new Date(msg.criadoEm).getTime();

    if (dataMsg - dataPagamento > LIMITE_DIAS_FATURAMENTO_MS) break;

    // Interrompe a janela se houver um novo envio de comprovante/pagamento do paciente
    if (
      msg.direcao === 'recebida' &&
      (msg.tipo === 'imagem' || /\b(?:comprovante|pago|pix|transferencia)\b/i.test(msg.conteudo || ''))
    ) {
      break;
    }

    if (msg.direcao === 'enviada') {
      const texto = (msg.conteudo || '').trim();

      // 1. Texto da clínica menciona explicitamente o envio de nota fiscal
      if (padraoNotaFiscalTexto(texto)) {
        return true;
      }

      // 2. Envio de documento (PDF)
      if (msg.tipo === 'documento') {
        const payloadDoc = (msg.payloadBruto as any)?.message?.documentMessage;
        const nomeArquivo = (payloadDoc?.fileName || payloadDoc?.title || '').trim();
        const legenda = (payloadDoc?.caption || '').trim();

        if (padraoNotaFiscalDocumento(nomeArquivo, legenda)) {
          return true;
        }
      }
    }
  }

  return false;
}

function padraoNotaFiscalTexto(texto: string): boolean {
  if (!texto) return false;
  return /(?:(?:sua|a|as|esta)\s+nota(?:s)?(?:\s+fiscal|\s+fiscais)?|sua\s+nf|segue\s+(?:sua\s+|a\s+)?(?:nota|nf)|nota\s+fiscal|danfse|nfse)/i.test(
    texto
  );
}

function padraoNotaFiscalDocumento(nomeArquivo: string, legenda: string): boolean {
  if (padraoNotaFiscalTexto(nomeArquivo) || padraoNotaFiscalTexto(legenda)) {
    return true;
  }
  // Chave de acesso de 40 a 50 dígitos (padrão nacional de NFS-e / NF-e)
  if (/\b\d{40,50}\b/.test(nomeArquivo)) {
    return true;
  }
  // Se for qualquer arquivo PDF enviado pela clínica após o pagamento
  if (/\.pdf$/i.test(nomeArquivo)) {
    return true;
  }
  return false;
}

