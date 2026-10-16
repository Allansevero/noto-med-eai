/**
 * Redação pura de mensagens enviadas ao médico pelo WhatsApp oficial do Noto Assistente.
 * Formata resumos de confirmação de nota, solicitações amigáveis de dados faltantes
 * e opções de desambiguação sem acoplamento com bibliotecas de envio.
 */

import type { PacienteEncontrado } from '../tipos.js';

export function redigirConfirmacaoPedido(params: {
  nomePaciente: string;
  dataConsulta: string;
  valorCentavos: number;
  avisoCpfDivergente?: string | null;
  precisaConfirmarValor?: boolean;
}): string {
  const valorFormatado = (params.valorCentavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  const linhas = [
    'Encontrei os dados para emissão da nota fiscal:',
    '',
    `👤 *Paciente:* ${params.nomePaciente}`,
    `📅 *Data da consulta:* ${params.dataConsulta}`,
    `💰 *Valor:* ${valorFormatado}`
  ];

  if (params.avisoCpfDivergente) {
    linhas.push('');
    linhas.push(`⚠️ _Nota de atenção:_ ${params.avisoCpfDivergente}`);
  }

  linhas.push('');
  if (params.precisaConfirmarValor) {
    linhas.push('Confirma a emissão neste valor?');
    linhas.push('👉 Responda *Sim* para emitir ou digite outro valor se desejar ajustar.');
  } else {
    linhas.push('Confirma a emissão da NFS-e?');
    linhas.push('👉 Responda *Sim* para emitir (ou digite o valor correto se quiser alterar).');
  }

  return linhas.join('\n');
}

export function redigirEscolhaMultipla(opcoes: PacienteEncontrado[], termoBuscado?: string | null): string {
  const linhas = [
    `Encontrei mais de um paciente para *"${termoBuscado || 'o nome informado'}"*. Qual deles você deseja emitir?`,
    ''
  ];

  opcoes.forEach((op, idx) => {
    const num = idx + 1;
    const finalTel = op.telefone ? ` (WhatsApp final ...${op.telefone.slice(-4)})` : '';
    linhas.push(`${num}️⃣ ${op.nome}${finalTel}`);
  });

  linhas.push('');
  linhas.push('👉 Responda com o número da opção (ex: *1* ou *2*).');
  return linhas.join('\n');
}

export function redigirSolicitacaoDadosFaltantes(params: {
  nomeBuscado?: string | null;
  precisaCpf: boolean;
  precisaValor: boolean;
  precisaTelefone: boolean;
}): string {
  const linhas = [
    `Não encontrei o cadastro de *"${params.nomeBuscado || 'este paciente'}"* nas suas conversas ou sistemas.`
  ];

  linhas.push('');
  linhas.push('Para emitirmos a nota, por favor me informe:');

  if (params.precisaCpf) {
    linhas.push('• CPF do paciente');
  }
  if (params.precisaValor) {
    linhas.push('• Valor da consulta (ex: R$ 400)');
  }
  if (params.precisaTelefone) {
    linhas.push('• WhatsApp do paciente (para enviarmos o PDF da nota)');
  }

  linhas.push('');
  linhas.push('👉 Pode digitar tudo numa mensagem só!');
  return linhas.join('\n');
}

export function redigirSucessoEmissao(nomePaciente: string, valorCentavos: number): string {
  const valorFormatado = (valorCentavos / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });

  return [
    `Perfeito! A nota fiscal de *${nomePaciente}* (${valorFormatado}) foi colocada na fila de emissão.`,
    'Assim que for autorizada pela prefeitura, o PDF será enviado diretamente para a conversa do paciente no seu WhatsApp e eu te aviso por aqui!'
  ].join('\n');
}

export function redigirCancelamentoPedido(nomePaciente?: string | null): string {
  return `Tudo bem! Cancelei a solicitação da nota fiscal de ${nomePaciente || 'paciente'}.`;
}
