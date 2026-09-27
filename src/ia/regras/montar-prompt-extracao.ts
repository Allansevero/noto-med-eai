/**
 * Montagem de prompts determinísticos para extração de dados de consultas médicas.
 * Separa a instrução da LLM da infraestrutura HTTP, permitindo testar a formatação
 * do prompt e as diretrizes de contexto temporal sem fazer chamadas de rede.
 */

export interface MensagensPromptExtracao {
  system: string;
  user: string;
}

export function formatarDataReferencia(data: Date): string {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  const hora = String(data.getHours()).padStart(2, '0');
  const minuto = String(data.getMinutes()).padStart(2, '0');
  const diaSemana = data.toLocaleDateString('pt-BR', { weekday: 'long' });
  return `${diaSemana}, ${ano}-${mes}-${dia} ${hora}:${minuto}`;
}

export function montarPromptExtracao(
  textoConversa: string,
  dataReferencia: Date = new Date()
): MensagensPromptExtracao {
  const refFormatada = formatarDataReferencia(dataReferencia);

  const system = `Você é um assistente de IA especialista em extração de dados de consultas e agendamentos médicos para emissão de NFS-e no Brasil.
Sua tarefa é analisar mensagens de WhatsApp trocadas entre médico/consultório e paciente e extrair as informações estruturadas em JSON.

Data e hora de referência atual: ${refFormatada}.
Ano atual de referência: ${dataReferencia.getFullYear()}.

Instruções estritas:
1. Extraia apenas dados expressos ou deduzíveis pelo contexto da conversa. Nunca invente dados.
2. Campos a extrair:
   - "nome_paciente": Nome completo ou primeiro nome do paciente (null se ausente).
   - "cpf": CPF do paciente contendo 11 dígitos, se mencionado na mensagem (null se ausente).
   - "data": Data da consulta no formato YYYY-MM-DD. Converta termos relativos ("hoje", "amanhã", dias da semana) com base na data de referência.
   - "horario": Horário da consulta no formato HH:mm (ex: "14:30").
   - "data_hora_iso": Junção da data e horário no formato ISO 8601 (YYYY-MM-DDTHH:mm:00) ou null.
   - "valor_centavos": Valor numérico total em centavos de Real (ex: R$ 350,00 -> 35000, 400 -> 40000). null se não mencionado.
   - "email": E-mail do paciente se fornecido, em minúsculas (null se ausente).
   - "descricao_servico": Breve descrição do serviço (ex: "Consulta médica", "Consulta dermatológica") se mencionada.
3. Retorne EXCLUSIVAMENTE um objeto JSON válido. Não inclua texto introdutório, explicações ou blocos markdown de código.`;

  const user = `Analise a seguinte conversa e extraia os dados da consulta:\n\n${textoConversa.trim()}`;

  return { system, user };
}
