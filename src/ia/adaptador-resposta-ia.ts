/**
 * Adaptador de IA para geração de resposta em uma única chamada.
 * Garante economia de tokens e latência previsível, extraindo intenções
 * e delegando validação e regras de negócio para o código determinístico.
 */

export interface EntradaAdaptadorIa {
  mensagemUsuario: string;
  historicoRecente: Array<{ autor: 'usuario' | 'assistente'; texto: string }>;
  contexto: {
    etapaAtual: string;
    interlocutor: string;
    nomeMedica?: string;
  };
}

export interface RespostaIaEstruturada {
  textoResposta: string;
  intencaoIdentificada?: string;
  dadosExtraidos?: Record<string, unknown>;
}

export interface ClienteIa {
  gerarResposta(prompt: string): Promise<string>;
}

export class AdaptadorRespostaIa {
  constructor(private readonly clienteIa: ClienteIa) {}

  async processarRespostaUnica(entrada: EntradaAdaptadorIa): Promise<RespostaIaEstruturada> {
    const prompt = this.montarPrompt(entrada);
    const respostaBruta = await this.clienteIa.gerarResposta(prompt);

    return this.parsearResposta(respostaBruta);
  }

  private montarPrompt(entrada: EntradaAdaptadorIa): string {
    return JSON.stringify({
      mensagem: entrada.mensagemUsuario,
      contexto: entrada.contexto,
      historico: entrada.historicoRecente.slice(-3)
    });
  }

  private parsearResposta(respostaBruta: string): RespostaIaEstruturada {
    try {
      const json = JSON.parse(respostaBruta);
      return {
        textoResposta: json.textoResposta || respostaBruta,
        intencaoIdentificada: json.intencaoIdentificada,
        dadosExtraidos: json.dadosExtraidos
      };
    } catch {
      return {
        textoResposta: respostaBruta.trim()
      };
    }
  }
}
