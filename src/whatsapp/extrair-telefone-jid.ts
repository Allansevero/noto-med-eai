/**
 * Extração e sanitização do número de telefone a partir do JID do WhatsApp.
 * Isola a regra de tratamento de identificadores do protocolo WhatsApp (Baileys/Evolution),
 * descartando mensagens de grupos (@g.us) e canais de status (@broadcast).
 */

export function extrairTelefoneJid(jid?: string | null): string | null {
  if (!jid || typeof jid !== 'string') {
    return null;
  }

  // Grupos, broadcasts e identificadores virtuais @lid não são telefones válidos
  if (jid.endsWith('@g.us') || jid.includes('@broadcast') || jid.endsWith('@lid')) {
    return null;
  }

  const [usuario] = jid.split('@');
  if (!usuario) {
    return null;
  }

  // Remove qualquer sufixo de dispositivo (ex.: 5511999998888:1) e caracteres não numéricos
  const [apenasNumero] = usuario.split(':');
  const digitos = apenasNumero.replace(/\D/g, '');

  if (digitos.length < 10 || digitos.length > 15) {
    return null;
  }

  return digitos;
}
