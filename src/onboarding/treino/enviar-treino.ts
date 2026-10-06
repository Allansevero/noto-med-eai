/**
 * Cada mensagem é reservada antes do envio e confirmada depois. Uma interrupção
 * com resultado desconhecido não autoriza reenviar o mesmo treino às cegas.
 */
import { MENSAGENS_TREINO, MENSAGENS_TREINO_LEGADO, type MensagemTreino } from './mensagens-treino.js';

export type ResultadoEnvioTreino = { sucesso: true; mensagemId?: string; formato: 'texto' | 'botao' }
  | { sucesso: false; incerto: boolean; motivo: string };
export interface TreinoRepositorio {
  criar(medicoId: string): Promise<void>;
  reservarEtapa(medicoId: string): Promise<{ etapa: number; mensagem: MensagemTreino } | null>;
  registrarResultado(medicoId: string, etapa: number, resultado: ResultadoEnvioTreino): Promise<void>;
}
export interface TreinoDeps {
  repositorio: TreinoRepositorio;
  consultarDestinatario(medicoId: string): Promise<{ liberado: boolean; telefone?: string | null }>;
  enviar(telefone: string, mensagem: MensagemTreino): Promise<ResultadoEnvioTreino>;
}

export async function enviarTreino(medicoId: string, deps: TreinoDeps): Promise<void> {
  const destinatario = await deps.consultarDestinatario(medicoId);
  if (!destinatario.liberado || !destinatario.telefone) return;
  await deps.repositorio.criar(medicoId);
  for (let i = 0; i < Math.max(MENSAGENS_TREINO.length, MENSAGENS_TREINO_LEGADO.length); i++) {
    const reserva = await deps.repositorio.reservarEtapa(medicoId);
    if (reserva === null) return;
    const { etapa, mensagem } = reserva;
    if (!mensagem) throw new Error('Etapa de treino não suportada.');
    let resultado: ResultadoEnvioTreino;
    try { resultado = await deps.enviar(destinatario.telefone, mensagem); }
    catch { resultado = { sucesso: false, incerto: true, motivo: 'Envio interrompido sem confirmação.' }; }
    await deps.repositorio.registrarResultado(medicoId, etapa, resultado);
    if (!resultado.sucesso) return;
  }
}
