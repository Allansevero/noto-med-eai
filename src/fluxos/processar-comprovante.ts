import type { ResultadoFonteAgenda } from '../agenda/fonte-agenda.js';
import type { DadosMensagemEvolution } from '../whatsapp/payload-webhook-schema.js';
import type { ExtratorComprovante, EstadoPedidoComprovante, ResultadoExtracaoComprovante,
  DecisaoPedidoComprovante } from '../atendimento/comprovante.js';
import type { HistoricoComunicacaoRepositorio } from '../onboarding/historico-comunicacao-repositorio.js';
import type { ProcessarWebhookDeps } from './processar-mensagem-webhook.js';

interface ProcessarComprovanteDeps {
  agenda?: ResultadoFonteAgenda;
  extrator: ExtratorComprovante;
  historico: Pick<HistoricoComunicacaoRepositorio, 'registrarComprovante'>;
  log: (nivel: 'erro', codigo: string) => void;
}

interface OrquestrarComprovanteDeps extends Omit<ProcessarComprovanteDeps, 'log'> {
  lerEstado: (medicoId: string, pacienteId: string) => Promise<EstadoPedidoComprovante>;
  log: (nivel: 'info' | 'erro', mensagem: string) => void;
}

export async function orquestrarComprovante(
  contexto: Parameters<NonNullable<ProcessarWebhookDeps['aoReceberComprovante']>>[0],
  deps: OrquestrarComprovanteDeps
): Promise<DecisaoPedidoComprovante> {
  const estado = await deps.lerEstado(contexto.medicoId, contexto.pacienteId);
  const decisao = await processarComprovante(contexto.mensagem, estado, deps);
  if (decisao.tipo === 'pedido_nota_pronto') deps.log('info', `pediria nota ${decisao.tipo}`);
  if (decisao.tipo === 'perguntar_medico' || decisao.tipo === 'perguntar_pacote' || decisao.tipo === 'pedir_agenda') deps.log('info', `enviaria ${decisao.tipo}`);
  return decisao;
}

export async function processarComprovante(
  mensagem: DadosMensagemEvolution, estado: EstadoPedidoComprovante, deps: ProcessarComprovanteDeps
): Promise<DecisaoPedidoComprovante> {
  let lido: ResultadoExtracaoComprovante | null = null;
  if (deps.agenda?.tipo !== 'erro') {
    try { lido = await deps.extrator.extrair(mensagem); }
    catch { /* A indisponibilidade é auditada sem inventar campos ou expor o erro do provedor. */ }
  }
  try { return await deps.historico.registrarComprovante(estado, lido, deps.agenda); }
  catch {
    deps.log('erro', 'AUDITORIA_COMPROVANTE_FALHOU');
    return { tipo: 'nenhuma', motivo: 'AUDITORIA_FALHOU' };
  }
}
