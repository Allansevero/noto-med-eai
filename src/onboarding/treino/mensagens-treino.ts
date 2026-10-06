/** Roteiro literal aprovado pelo usuário; preservar grafia, ordem e conteúdo. */
export interface MensagemTreino { texto: string; copiarTexto?: string }
export const MODELO_EMISSAO_TREINO = "Vou enviar em instantes a sua nota fiscal no valor de R$ [valor] referente à consulta de [data].";
export const MENSAGENS_TREINO: readonly MensagemTreino[] = [
  { texto: "Olá! Eu sou o Noto, seu assistente fiscal aqui no WhatsApp. Pode contar comigo para emitir suas notas no automático e tirar qualquer dúvida tributária." },
  { texto: "A emissão é bem simples. Para começar, copie a mensagem abaixo e salve nas suas Mensagens Rápidas do WhatsApp (sugiro usar o atalho /nota):" },
  { texto: MODELO_EMISSAO_TREINO, copiarTexto: MODELO_EMISSAO_TREINO },
  { texto: "Pronto. Agora, sempre que quiser emitir uma nota, basta enviar essa mensagem preenchida para o seu paciente. Em poucos segundos, a nota pronta aparece na conversa." },
  { texto: "E um detalhe muito bom: você não vai precisar cadastrar ninguém. Eu mesmo puxo os dados do paciente no histórico da conversa. Se faltar o CPF, eu peço com toda a educação, como se fosse você. Simples assim." },
];

// Reservas antigas mantêm as seis etapas originais; não misturar roteiros em andamento.
const MODELO_EMISSAO_LEGADO = "Vou enviar em instantes a sua NF no valor de R$ [preecha] referente a consulta [preecha]";
export const MENSAGENS_TREINO_LEGADO: readonly MensagemTreino[] = [
  { texto: "Oie! Eu cxcwsou o Noto, seu assistente fiscal direto no WhatsApp. Conte comigo para emitir quantas notas quiser e tirar dúvidas tributárias." },
  { texto: "Agora vou te explicar como funciona a emissão automático. É simples..." },
  { texto: "Primeiro, copie a mensagem abaixo e cole na mensagem rápida com nome de atalho \"emissoes\" ou outro que prefira.", copiarTexto: MODELO_EMISSAO_LEGADO },
  { texto: MODELO_EMISSAO_LEGADO },
  { texto: "Agora, toda vez que você quiser emitir uma nota basta escolher essa mensagem, preencher os campos de valor e data e enviar para o paciente. Após alguns segundos a nota aparecerá na conversa." },
  { texto: "Eu mesmo pego os dados do paciente no histórico da conversa. E caso não enconte, eu peço - como se fosse você - para me reenviar o CPF. Então, não precisa se preocupar em cadastrar paciente." },
];
