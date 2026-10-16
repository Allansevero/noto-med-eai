/**
 * Redação humanizada da notificação enviada ao médico pelo WhatsApp quando um
 * comprovante legítimo é identificado. Informa valor, paciente e orienta sobre
 * a confirmação e a pendência de CPF quando houver.
 */

export interface DadosParaNotificacao {
  nomePaciente?: string | null;
  valorCentavos: number;
  dataPagamento?: string | null;
  tipoPagamento?: string | null;
  temCpf: boolean;
}

export function redigirNotificacaoCandidato(
  dados: DadosParaNotificacao,
  nomeMedico?: string | null
): string {
  const primeiroNomeMedico = extrairPrimeiroNome(nomeMedico);
  const saudacao = primeiroNomeMedico ? `Olá, Dr(a). ${primeiroNomeMedico}!` : 'Olá!';

  const nomePaciente = dados.nomePaciente?.trim() || 'Paciente';
  const valorFormatado = (dados.valorCentavos / 100).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const tipo = (dados.tipoPagamento || 'PIX').toUpperCase();
  const dataTexto = formatarDataBrasileira(dados.dataPagamento);
  const detalheData = dataTexto ? ` (${tipo} em ${dataTexto})` : ` (${tipo})`;

  if (dados.temCpf) {
    return `${saudacao} Identifiquei um comprovante de R$ ${valorFormatado} de ${nomePaciente}${detalheData}.\n\nPosso emitir a NFS-e agora? (Responda "sim" ou "não")`;
  }

  return `${saudacao} Identifiquei um comprovante de R$ ${valorFormatado} de ${nomePaciente}${detalheData}.\n\nAinda não temos o CPF de ${nomePaciente}. Me envie o CPF dele aqui para emitir a NFS-e (ou responda "pedir" que solicito direto a ele no WhatsApp).`;
}

function extrairPrimeiroNome(nomeCompleto?: string | null): string {
  if (!nomeCompleto) return '';
  const limpo = nomeCompleto.trim().replace(/^dr\(a\)\.?\s+/i, '').replace(/^dr\.?\s+/i, '').replace(/^dra\.?\s+/i, '');
  return limpo.split(/\s+/)[0] || '';
}

function formatarDataBrasileira(dataIso?: string | null): string {
  if (!dataIso || !/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) return '';
  const [ano, mes, dia] = dataIso.split('-');
  return `${dia}/${mes}/${ano}`;
}
