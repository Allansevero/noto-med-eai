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
  dataReferencia: Date = new Date()
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
    const dadosPagamento = extrairDadosPagamento(msgAtual);
    if (!dadosPagamento) continue;

    // Buscar no histórico ANTERIOR à mensagem de pagamento a data da consulta e o nome do paciente
    const mensagensAnteriores = ordenadas.slice(0, i);
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

function extrairDadosPagamento(msg: MensagemContextoConversa): DadosPagamentoDetectados | null {
  const texto = msg.conteudo || '';

  // 1. Link de pagamento com valor explícito (ex: InfinitePay, Mercado Pago)
  // Exemplo: https://link.infinitepay.io/...-1600,00 ou -470,00
  const matchLink = texto.match(/link\.[a-z0-9\.\-\/]+-(\d+)[,\.](\d{2})/i);
  if (matchLink) {
    const reais = parseInt(matchLink[1], 10);
    const centavos = parseInt(matchLink[2], 10);
    const totalCentavos = reais * 100 + centavos;
    return {
      valorCentavos: totalCentavos,
      valorFormatado: `${reais},${matchLink[2]}`,
      trecho: matchLink[0]
    };
  }

  // 2. Comprovante ou texto com Valor: R$ 1350,00 ou R$ 550,00
  const matchValorPix = texto.match(/(?:valor|total|pago|pix)?\s*:?\s*r\$\s*([\d\.]+),(\d{2})/i);
  if (matchValorPix) {
    const reaisStr = matchValorPix[1].replace(/\./g, '');
    const reais = parseInt(reaisStr, 10);
    const centavos = parseInt(matchValorPix[2], 10);
    const totalCentavos = reais * 100 + centavos;
    if (totalCentavos > 0) {
      return {
        valorCentavos: totalCentavos,
        valorFormatado: `${matchValorPix[1]},${matchValorPix[2]}`,
        trecho: matchValorPix[0]
      };
    }
  }

  // 3. Imagem com payload de comprovante já analisado (via PaliGemma)
  const comp = msg.payloadBruto?.comprovante as Record<string, any> | undefined;
  if (comp && comp.ehComprovante && typeof comp.valorCentavos === 'number' && comp.valorCentavos > 0) {
    const valorReais = (comp.valorCentavos / 100).toFixed(2).replace('.', ',');
    return {
      valorCentavos: comp.valorCentavos,
      valorFormatado: valorReais,
      trecho: `Comprovante bancário ${comp.tipo || 'Pix'} de R$ ${valorReais}`
    };
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
  let nomeEncontrado = nomeCadastro ? nomeCadastro.trim() : '';
  let dataConsultaFormatada = '';
  let dataConsultaIso = '';
  let mensagemId: string | undefined;
  let trecho: string | undefined;

  // Percorre as mensagens anteriores de trás para frente (da mais recente para a mais antiga)
  for (let i = mensagensAnteriores.length - 1; i >= 0; i--) {
    const msg = mensagensAnteriores[i];
    const texto = msg.conteudo || '';

    // Extrair nome da saudação caso ainda não tenhamos nome completo
    if (!nomeEncontrado) {
      const matchSaudacao = texto.match(/ol[áa],?\s*\*?([A-ZÀ-Ú][a-zà-ú]+(?:\s+[A-ZÀ-Ú][a-zà-ú]+)*)\*?/i);
      if (matchSaudacao && matchSaudacao[1].length >= 3) {
        nomeEncontrado = matchSaudacao[1].trim();
      }
    }

    // Extrair data da consulta / agendamento
    if (!dataConsultaFormatada) {
      // Padrões comuns: "agendado para, *13/10/2026*", "consulta de 09/10/26", "atendimento dia 08/10"
      const matchAgendamento = texto.match(/(?:agendad[oa]|procedimento|consulta|atendimento|sess[aã]o)\s*(?:para|de|em|dia)?,?\s*\*?(\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?)\*?/i);
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
        if (/(?:agendad|hor[áa]rio|consulta|procedimento|m[ée]dic|dr)/i.test(texto)) {
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
