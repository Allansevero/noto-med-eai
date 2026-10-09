import type { EnviarMensagemPaciente } from './enviar-mensagem-paciente.js';
/** O oficial é reservado ao OTP; médicos conversam pelo assistente e pacientes pela clínica. */
export function criarEnviadorConversasNoto(deps: {
  oficialNome: string;
  assistenteNome: string;
  assistente: EnviarMensagemPaciente;
  clinicas: EnviarMensagemPaciente;
}): EnviarMensagemPaciente {
  return {
    enviarTexto: (params) => {
      if (params.instanciaNome === deps.oficialNome)
        return Promise.resolve({
          sucesso: false,
          erro: 'CANAL_OFICIAL_SOMENTE_OTP'
        });
      return (
        params.instanciaNome === deps.assistenteNome
          ? deps.assistente
          : deps.clinicas
      ).enviarTexto(params);
    }
  };
}
