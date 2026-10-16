/**
 * Motor de correlação e tomada de decisão sobre candidatos a emissão (80% regra, 20% IA).
 * Analisa as mensagens da conversa e formula a pergunta exata que o Noto
 * enviará ao médico no WhatsApp para solicitar autorização ou CPF faltante.
 */

import { extrairContextoConsultaConversa } from './extrair-contexto-consulta-conversa.js';
import type {
  RequisicaoDetectarCandidatos,
  RespostaDetectarCandidatosSucesso
} from '../../../contratos/tipos-ia.js';

export function decidirCandidatoConversa(
  requisicao: RequisicaoDetectarCandidatos
): RespostaDetectarCandidatosSucesso {
  const { dadosMedico, conversa } = requisicao;
  const mensagens = conversa.mensagens || [];

  // 1. Procurar por mensagens que representam pagamento ou mídia de comprovante
  let mensagemComprovante = mensagens.find(
    (m) => m.tipo === 'imagem' || m.tipo === 'documento' || /comprovante|pago|pix|transferencia|transferi/i.test(m.conteudo || '')
  );

  // Se não houver mensagens com indício de pagamento
  if (!mensagemComprovante) {
    return {
      sucesso: true,
      candidatoDetectado: false,
      dadosFaltantes: []
    };
  }

  // 2. Extrair contexto de paciente e data de consulta
  const contexto = extrairContextoConsultaConversa(
    mensagens,
    conversa.pacienteNomeCadastrado || conversa.contatoNome
  );

  const valorCentavos = dadosMedico.valorPadraoCentavos || 45000;
  const valorFormatado = (valorCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dataHojeIso = new Date().toISOString().slice(0, 10);
  const dataConsulta = contexto.dataConsultaFormatada || new Date().toLocaleDateString('pt-BR');
  const nomePaciente = contexto.nomePaciente;

  // 3. Verificar dados faltantes (ex: CPF do paciente)
  const dadosFaltantes: string[] = [];
  let perguntaDadosFaltantes: string | null = null;

  // Se a conversa não tem indício de CPF (11 dígitos válidos)
  const temCpfNasMensagens = mensagens.some(m => /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(m.conteudo || ''));
  if (!temCpfNasMensagens) {
    dadosFaltantes.push('cpf');
    perguntaDadosFaltantes = `${nomePaciente} ainda não possui CPF informado. Você tem o CPF do paciente para incluir na nota?`;
  }

  // 4. Formular a pergunta sugerida ao médico ("A IA decide, o Noto fala")
  const perguntaSugeridaMedico = `Identifiquei um pagamento de ${valorFormatado} de ${nomePaciente} referente à consulta de ${dataConsulta}. Posso emitir a nota fiscal?`;

  return {
    sucesso: true,
    candidatoDetectado: true,
    confianca: 0.95,
    dadosExtraidos: {
      valorCentavos,
      dataPagamento: dataHojeIso,
      dataConsultaSugerida: contexto.dataConsultaIso || dataHojeIso,
      origemDataConsulta: contexto.dataConsultaFormatada ? 'mensagem_agendamento' : 'data_pagamento',
      pagadorNome: nomePaciente
    },
    perguntaSugeridaMedico,
    dadosFaltantes,
    perguntaDadosFaltantes
  };
}
