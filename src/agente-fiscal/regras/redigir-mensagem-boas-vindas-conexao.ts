/**
 * Redação humanizada da mensagem enviada ao médico logo após a conexão do WhatsApp.
 * Tranquiliza o médico, explica que o Noto está organizando o histórico de pacientes
 * e que retornará com calma para solicitar a aprovação de emissão dos atendimentos.
 */

export function redigirMensagemBoasVindasConexao(nomeCompletoMedico?: string | null): string {
  const limpo = (nomeCompletoMedico || '')
    .trim()
    .replace(/^(?:dr[a-z]?\.?|m[ée]dic[oa]\.?)\s+/i, '')
    .trim();
  const primeiroNome = limpo.split(/\s+/)[0] || '';
  const saudacao = primeiroNome && primeiroNome.length > 1
    ? `Oi, Dr(a). ${primeiroNome.charAt(0).toUpperCase() + primeiroNome.slice(1).toLowerCase()}!`
    : 'Oi!';

  return `${saudacao} Sou o Noto e vou cuidar da emissão das suas notas fiscais por aqui.\n\nNeste momento estou organizando e mapeando o histórico dos seus pacientes para deixar o cadastro deles em dia.\n\nNão precisa me enviar nada agora. Logo mais eu retorno para solicitar a aprovação de emissão dos atendimentos que encontrar!`;
}
