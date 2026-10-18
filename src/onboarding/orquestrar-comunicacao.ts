import { decidirProximaAcao, type EstadoMedicoAposOnboarding, type ProximaAcaoNoto } from './regras/decidir-proxima-acao.js';
import type { HistoricoComunicacaoRepositorio } from './historico-comunicacao-repositorio.js';

interface EntradaComunicacao {
  medicoId: string;
  chaveProcessamento: string;
  estado: Omit<EstadoMedicoAposOnboarding, 'historico'> & { agora: Date };
}
interface DependenciasComunicacao {
  historico: HistoricoComunicacaoRepositorio;
  log: (nivel: 'info' | 'erro', mensagem: string) => void;
  envioRealAtivo?: boolean;
}

export async function orquestrarComunicacao(
  entrada: EntradaComunicacao,
  dependencias: DependenciasComunicacao
): Promise<ProximaAcaoNoto> {
  const { historico, log, envioRealAtivo = false } = dependencias;
  if (envioRealAtivo) {
    log('erro', 'ENVIO_REAL_NAO_IMPLEMENTADO');
    return { tipo: 'nenhuma' };
  }
  const { medicoId, chaveProcessamento, estado } = entrada;
  let reservado = false;
  try {
    reservado = await historico.reservar(medicoId, 'simulado', chaveProcessamento);
    if (!reservado) return { tipo: 'nenhuma' };
    const salvo = await historico.ler(medicoId, 'simulado');
    const acao = decidirProximaAcao({ ...estado, historico: salvo });
    if (acao.tipo === 'nenhuma') return acao;
    await historico.gravarAcao(medicoId, 'simulado', chaveProcessamento, acao, estado.agora.toISOString());
    log('info', `enviaria ${acao.tipo}`);
    return acao;
  } catch {
    log('erro', 'HISTORICO_COMUNICACAO_FALHOU');
    return { tipo: 'nenhuma' };
  } finally {
    if (reservado) await historico.liberar(medicoId, 'simulado', chaveProcessamento)
      .catch(() => log('erro', 'HISTORICO_LIBERACAO_FALHOU'));
  }
}
