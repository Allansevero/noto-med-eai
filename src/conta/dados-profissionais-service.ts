/** Retoma solicitações da API após confirmação dos dados no painel. */
export interface DadosProfissionaisService {
  retomar(medicoId: string): Promise<number>;
}
