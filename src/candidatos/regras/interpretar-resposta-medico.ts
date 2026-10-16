/**
 * Interpretação pura das mensagens de resposta enviadas pelo médico no WhatsApp.
 * Classifica a intenção entre aprovação, recusa, fornecimento de CPF ou delegação
 * de solicitação para o paciente sem chamadas externas.
 */

import { extrairCpfTexto } from '../../paciente/extrair-cpf-texto.js';
import type { DecisaoMedico } from '../tipos.js';

export function interpretarRespostaMedico(textoRecebido?: string | null): DecisaoMedico {
  if (!textoRecebido || typeof textoRecebido !== 'string') {
    return { acao: 'ignorar' };
  }

  const texto = textoRecebido.trim().toLowerCase();
  if (texto.length === 0) return { acao: 'ignorar' };

  // 1. Fornecimento de CPF no texto
  const cpf = extrairCpfTexto(texto);
  if (cpf) {
    return { acao: 'fornecer_cpf', cpf };
  }

  // 2. Pedido para solicitar diretamente ao paciente
  if (ehPedidoSolicitacaoPaciente(texto)) {
    return { acao: 'pedir_cpf_paciente' };
  }

  // 3. Recusa explícita
  if (ehRespostaNegativa(texto)) {
    return { acao: 'recusar' };
  }

  // 4. Aprovação com eventual ajuste de valor
  const ajusteValor = extrairAjusteValor(texto);
  if (ajusteValor !== undefined) {
    return { acao: 'aprovar', valorAjustadoCentavos: ajusteValor };
  }

  if (ehRespostaAfirmativa(texto)) {
    return { acao: 'aprovar' };
  }

  return { acao: 'ignorar' };
}

function ehRespostaAfirmativa(texto: string): boolean {
  const limpo = texto.replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(?:sim|s|pode|pode emitir|emite|emitir|manda|confirmo|confirmar|ok|blz|positivo|autorizo|1)(?:\s+(?:pode|emitir|sim|por favor|com certeza|a nota))*$/i.test(limpo)
    || /\b(?:pode emitir|sim pode|pode sim|emite ai|autorizado)\b/i.test(limpo)
    || /^(?:pode ser|por favor|com certeza|claro)$/i.test(limpo);
}

function ehRespostaNegativa(texto: string): boolean {
  const limpo = texto.replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(?:não|nao|n|recusar|recusa|cancela|cancelar|deixa|agora não|agora nao|não emitir|nao emitir|2)(?:\s+(?:por favor|cancela|não|nao|deixa|obrigado))*$/i.test(limpo)
    || /\b(?:não emitir|cancela|cancelar|recusar|não precisa|nao precisa)\b/i.test(limpo);
}

function ehPedidoSolicitacaoPaciente(texto: string): boolean {
  const limpo = texto.replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(?:pedir|pede|solicitar|solicite|pede pra ele|pede pra ela|solicita pro paciente|manda mensagem)$/i.test(limpo);
}

function extrairAjusteValor(texto: string): number | undefined {
  const match = texto.match(/(?:valor|ajustar para|alterar para|mudar para|emita por)\s*(?:r\$\s*)?(\d+(?:[.,]\d{1,2})?)/i);
  if (!match || !match[1]) return undefined;
  const numStr = match[1].replace(',', '.');
  const valor = parseFloat(numStr);
  if (isNaN(valor) || valor <= 0) return undefined;
  return Math.round(valor * 100);
}
