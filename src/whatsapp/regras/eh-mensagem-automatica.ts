/**
 * Identifica se uma mensagem recebida é uma resposta automática do WhatsApp (Business/bot).
 * Necessário para evitar que mensagens de ausência, boas-vindas ou menus de atendimento
 * da clínica do médico sejam interpretadas como respostas de aprovação ou comandos fiscais.
 */

export function ehMensagemAutomatica(textoBruto: string | null | undefined): boolean {
  if (!textoBruto) return false;

  const normal = textoBruto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();

  if (normal.length === 0) return false;

  // 1. Termos explícitos de automação
  if (/\b(?:mensagem\s+automatica|resposta\s+automatica|nao\s+responda\s+a\s+esta\s+mensagem|robo\s+de\s+atendimento|assistente\s+virtual)\b/i.test(normal)) {
    return true;
  }

  // 2. Mensagens de ausência e horários de atendimento da clínica
  const temAusencia = /\b(?:ausente|ausentes|fora\s+do\s+horario|fechado|retornaremos|responderemos|em\s+breve)\b/i.test(normal);
  const temAgradecimento = /\b(?:agradecemos\s+(?:o\s+contato|sua\s+mensagem|pela\s+mensagem)|obrigad[oa]\s+(?:por\s+entrar\s+em\s+contato|pelo\s+contato))\b/i.test(normal);
  const temHorario = /\b(?:horario\s+de\s+atendimento|atendemos\s+de\s+segunda|expediente)\b/i.test(normal);

  if ((temAgradecimento && (temAusencia || temHorario)) || (temAusencia && temHorario)) {
    return true;
  }

  if (temAgradecimento && /\b(?:em\s+breve|assim\s+que\s+possivel|logo\s+mais)\b/i.test(normal)) {
    return true;
  }

  // 3. Menus interativos numéricos de recepção ("Digite 1 para agendamento, 2 para...")
  if (/\b(?:digite\s+\d|escolha\s+(?:uma\s+das\s+)?opc(?:ao|oes)|1\s*[-–]\s*agendamento|2\s*[-–]\s*informac)/i.test(normal)) {
    return true;
  }

  return false;
}
