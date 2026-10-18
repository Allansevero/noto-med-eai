import type { DadosMensagemEvolution } from '../whatsapp/payload-webhook-schema.js';
import type { ExtratorComprovante, EstadoPedidoComprovante, ResultadoExtracaoComprovante,
  DecisaoPedidoComprovante } from '../atendimento/comprovante.js';
import type { HistoricoComunicacaoRepositorio } from '../onboarding/historico-comunicacao-repositorio.js';

interface ProcessarComprovanteDeps {
  extrator: ExtratorComprovante;
  historico: Pick<HistoricoComunicacaoRepositorio, 'registrarComprovante'>;
  log: (nivel: 'erro', codigo: string) => void;
}

export async function processarComprovante(
  mensagem: DadosMensagemEvolution, estado: EstadoPedidoComprovante, deps: ProcessarComprovanteDeps
): Promise<DecisaoPedidoComprovante> {
  let lido: ResultadoExtracaoComprovante | null = null;
  try { lido = await deps.extrator.extrair(mensagem); }
  catch { /* A indisponibilidade é auditada sem inventar campos ou expor o erro do provedor. */ }
  try { return await deps.historico.registrarComprovante(estado, lido); }
  catch {
    deps.log('erro', 'AUDITORIA_COMPROVANTE_FALHOU');
    return { tipo: 'nenhuma', motivo: 'AUDITORIA_FALHOU' };
  }
}
