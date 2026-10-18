import { orquestrarComunicacao } from './orquestrar-comunicacao.js';
import type { HistoricoComunicacaoRepositorio } from './historico-comunicacao-repositorio.js';
import type { ProximaAcaoNoto, ExtratorRespostaMedico } from './regras/decidir-proxima-acao.js';

type Entrada = Parameters<typeof orquestrarComunicacao>[0];
export type EstadoComunicacaoMedico = Pick<Entrada, 'nomeMedico' | 'estado'>;

// Serializa os gatilhos locais para que uma resposta não seja descartada por reserva ocupada.
const processamentos = new Map<string, Promise<ProximaAcaoNoto>>();

/** A flag habilita somente a simulação; não recebe transporte nem opção de envio real. */
export async function processarComunicacaoMedico(
  entrada: Pick<Entrada, 'medicoId' | 'chaveProcessamento' | 'respostaMedico'> & { agora: Date },
  deps: { ativo: boolean; extratorResposta?: ExtratorRespostaMedico; historico: HistoricoComunicacaoRepositorio;
    lerEstado: (medicoId: string, agora: Date) => Promise<EstadoComunicacaoMedico | null>;
    log: (nivel: 'info' | 'erro', mensagem: string) => void }
): Promise<ProximaAcaoNoto> {
  if (!deps.ativo) return { tipo: 'nenhuma' };
  const anterior = processamentos.get(entrada.medicoId);
  const processamento = (anterior ? anterior.catch(() => {}) : Promise.resolve()).then(async (): Promise<ProximaAcaoNoto> => {
    try {
      const estado = await deps.lerEstado(entrada.medicoId, entrada.agora);
      if (!estado) return { tipo: 'nenhuma' };
      return await orquestrarComunicacao({ ...entrada, ...estado }, { historico: deps.historico, log: deps.log, envioRealAtivo: false, extratorResposta: deps.extratorResposta });
    } catch {
      deps.log('erro', 'COMUNICACAO_ESTADO_FALHOU');
      return { tipo: 'nenhuma' };
    }
  });
  processamentos.set(entrada.medicoId, processamento);
  try { return await processamento; }
  finally { if (processamentos.get(entrada.medicoId) === processamento) processamentos.delete(entrada.medicoId); }
}
