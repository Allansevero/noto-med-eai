/**
 * Roteiro versionado para ensinar o comando que o emissor já reconhece.
 * O texto copiável fica separado das instruções para não confundir o paciente.
 */
import { TEXTO_MODELO_PADRAO_EMISSAO } from '../../whatsapp/whatsapp-config.js';

export const MODELO_EMISSAO_TREINO = `${TEXTO_MODELO_PADRAO_EMISSAO} [VALOR] referente à consulta de [DD/MM/AAAA].`;
export interface MensagemTreino { texto: string; copiarTexto?: string }

export const MENSAGENS_TREINO: readonly MensagemTreino[] = [
  { texto: 'Oie! Eu sou o Noto, seu assistente para emissão de notas fiscais pelo WhatsApp. Seu consultório está conectado! Vou te mostrar como emitir suas notas automaticamente. 😊' },
  { texto: 'Primeiro, no WhatsApp Business do consultório, abra Ferramentas comerciais → Respostas rápidas e crie uma resposta com o atalho "emissoes", ou outro nome que preferir. Copie a mensagem que vou enviar a seguir e salve como texto dessa resposta. Se o botão de copiar não aparecer, toque e segure a mensagem para copiar. No WhatsApp comum, você pode colar o modelo diretamente na conversa do paciente.' },
  { texto: MODELO_EMISSAO_TREINO, copiarTexto: MODELO_EMISSAO_TREINO },
  { texto: 'Quando quiser emitir uma nota, abra a conversa do paciente, escolha a resposta rápida e substitua [VALOR] pelo valor da consulta e [DD/MM/AAAA] pela data em que ela aconteceu. Depois, envie a mensagem ao paciente. O nome do atalho pode mudar; mantenha o texto do modelo e preencha os dois campos antes de enviar.' },
  { texto: 'Essa mensagem solicita uma emissão real. Eu preparo a nota e, quando ela for autorizada, envio o PDF na mesma conversa do paciente. O tempo depende do serviço de emissão, e valem os limites do seu plano.' },
  { texto: 'Eu procuro os dados disponíveis do paciente no histórico sincronizado da conversa. Se faltar o CPF, peço o reenvio pelo WhatsApp do consultório. Assim, em geral você não precisa cadastrar o paciente manualmente. Se faltar alguma informação ou surgir uma pendência que eu não consiga resolver, aviso você.' }
];
