import { orquestrarComunicacao } from './orquestrar-comunicacao.js';
import type { HistoricoComunicacaoRepositorio } from './historico-comunicacao-repositorio.js';
import type { ProximaAcaoNoto } from './regras/decidir-proxima-acao.js';

type Entrada = Parameters<typeof orquestrarComunicacao>[0];
export type EstadoComunicacaoMedico = Pick<Entrada, 'nomeMedico' | 'estado'>;

/** A flag habilita somente a simulação; não recebe transporte nem opção de envio real. */
export async function processarComunicacaoMedico(
  entrada: Pick<Entrada, 'medicoId' | 'chaveProcessamento' | 'respostaMedico'> & { agora: Date },
  deps: { ativo: boolean; historico: HistoricoComunicacaoRepositorio;
    lerEstado: (medicoId: string, agora: Date) => Promise<EstadoComunicacaoMedico | null>;
    log: (nivel: 'info' | 'erro', mensagem: string) => void }
): Promise<ProximaAcaoNoto> {
  if (!deps.ativo) return { tipo: 'nenhuma' };
  try {
    const estado = await deps.lerEstado(entrada.medicoId, entrada.agora);
    if (!estado) return { tipo: 'nenhuma' };
    return await orquestrarComunicacao({ ...entrada, ...estado }, { historico: deps.historico, log: deps.log, envioRealAtivo: false });
  } catch {
    deps.log('erro', 'COMUNICACAO_ESTADO_FALHOU');
    return { tipo: 'nenhuma' };
  }
}
