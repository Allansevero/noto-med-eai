/**
 * Utilitário puro para cronometragem e registro de latência de etapas
 * no ciclo de atendimento do WhatsApp e emissão de notas.
 */

export interface RegistroEtapa {
  etapa: string;
  duracaoMs: number;
  timestamp: number;
}

export interface RastreadorLatencia {
  iniciarEtapa(etapa: string): () => RegistroEtapa;
  obterMetricas(): RegistroEtapa[];
  tempoTotalMs(): number;
}

export function criarRastreadorLatencia(): RastreadorLatencia {
  const etapas: RegistroEtapa[] = [];
  const inicioGeral = Date.now();

  return {
    iniciarEtapa(nomeEtapa: string) {
      const inicio = Date.now();
      return () => {
        const duracao = Date.now() - inicio;
        const registro: RegistroEtapa = {
          etapa: nomeEtapa,
          duracaoMs: duracao,
          timestamp: Date.now()
        };
        etapas.push(registro);
        return registro;
      };
    },
    obterMetricas() {
      return [...etapas];
    },
    tempoTotalMs() {
      return Date.now() - inicioGeral;
    }
  };
}
