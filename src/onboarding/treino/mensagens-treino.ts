/** Roteiro literal aprovado pelo usuário; preservar grafia, ordem e conteúdo. */
export const MODELO_EMISSAO_TREINO = "Vou enviar em instantes a sua NF no valor de R$ [preecha] referente a consulta [preecha]";
export interface MensagemTreino { texto: string; copiarTexto?: string }

export const MENSAGENS_TREINO: readonly MensagemTreino[] = [
  { texto: "Oie! Eu cxcwsou o Noto, seu assistente fiscal direto no WhatsApp. Conte comigo para emitir quantas notas quiser e tirar dúvidas tributárias." },
  { texto: "Agora vou te explicar como funciona a emissão automático. É simples..." },
  { texto: "Primeiro, copie a mensagem abaixo e cole na mensagem rápida com nome de atalho \"emissoes\" ou outro que prefira.", copiarTexto: MODELO_EMISSAO_TREINO },
  { texto: MODELO_EMISSAO_TREINO },
  { texto: "Agora, toda vez que você quiser emitir uma nota basta escolher essa mensagem, preencher os campos de valor e data e enviar para o paciente. Após alguns segundos a nota aparecerá na conversa." },
  { texto: "Eu mesmo pego os dados do paciente no histórico da conversa. E caso não enconte, eu peço - como se fosse você - para me reenviar o CPF. Então, não precisa se preocupar em cadastrar paciente." },
];
