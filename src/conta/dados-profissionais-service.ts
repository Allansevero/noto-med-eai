/** Recebe exclusivamente respostas de um médico autenticado no chat oficial. */
export interface DadosProfissionaisService {
  solicitar(medicoId: string): Promise<void>;
  processarResposta(entrada: { medicoId: string; texto: string; mensagemId: string }): Promise<{ tratada: boolean; completo: boolean }>;
  retomar(medicoId: string): Promise<number>;
}
