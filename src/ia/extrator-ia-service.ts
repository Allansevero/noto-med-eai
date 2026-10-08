/**
 * Porta de serviço para extração inteligente de dados de consultas médicas via IA.
 * Isola a comunicação com provedores de LLM (como a NVIDIA API) das regras de negócio
 * e fluxos do WhatsApp, permitindo testes sem dependências de rede e troca de modelo.
 */

export interface DadosExtracaoIa {
  nomePaciente?: string | null;
  cpfPaciente?: string | null;
  dataConsulta?: string | null;
  horaConsulta?: string | null;
  dataHoraIso?: string | null;
  valorConsultaCentavos?: number | null;
  emailPaciente?: string | null;
  especialidadeOuDescricao?: string | null;
}

export interface ExtratorIaService {
  extrairDados(
    textoConversa: string,
    dataReferencia?: Date
  ): Promise<DadosExtracaoIa>;
}
