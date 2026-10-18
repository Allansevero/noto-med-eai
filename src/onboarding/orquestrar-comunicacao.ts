import { decidirProximaAcao, montarBoasVindas, type EstadoMedicoAposOnboarding, type ProximaAcaoNoto } from './regras/decidir-proxima-acao.js';
import type { HistoricoComunicacaoRepositorio } from './historico-comunicacao-repositorio.js';
import type { EnviarMensagemPaciente } from '../whatsapp/enviar-mensagem-paciente.js';

interface EntradaComunicacao {
  medicoId: string;
  chaveProcessamento: string;
  nomeMedico?: string;
  instanciaNome?: string;
  contatoTelefone?: string;
  estado: Omit<EstadoMedicoAposOnboarding, 'historico'> & { agora: Date };
}
interface DependenciasComunicacao {
  historico: HistoricoComunicacaoRepositorio;
  log: (nivel: 'info' | 'erro', mensagem: string) => void;
  envioRealAtivo?: boolean;
  transporte?: EnviarMensagemPaciente;
}

export async function orquestrarComunicacao(
  entrada: EntradaComunicacao,
  dependencias: DependenciasComunicacao
): Promise<ProximaAcaoNoto> {
  const { historico, log, envioRealAtivo = false } = dependencias;
  const modo = envioRealAtivo ? 'real' : 'simulado';
  const { medicoId, chaveProcessamento, estado } = entrada;
  let reservado = false;
  try {
    reservado = await historico.reservar(medicoId, modo, chaveProcessamento);
    if (!reservado) return { tipo: 'nenhuma' };
    const salvo = await historico.ler(medicoId, modo);
    const acao = decidirProximaAcao({ ...estado, historico: salvo });
    if (acao.tipo === 'nenhuma') return acao;
    if (envioRealAtivo) return await enviarAcao(entrada, dependencias, acao);
    await historico.gravarAcao(medicoId, 'simulado', chaveProcessamento, acao, estado.agora.toISOString());
    log('info', `enviaria ${acao.tipo}`);
    return acao;
  } catch {
    log('erro', 'HISTORICO_COMUNICACAO_FALHOU');
    return { tipo: 'nenhuma' };
  } finally {
    if (reservado) await historico.liberar(medicoId, modo, chaveProcessamento)
      .catch(() => log('erro', 'HISTORICO_LIBERACAO_FALHOU'));
  }
}

async function enviarAcao(
  entrada: EntradaComunicacao, dependencias: DependenciasComunicacao, acao: ProximaAcaoNoto
): Promise<ProximaAcaoNoto> {
  const { historico, log } = dependencias;
  if (acao.tipo !== 'boas_vindas') {
    log('erro', 'COMUNICACAO_SEM_TEXTO_APROVADO');
    return acao;
  }
  const { medicoId, chaveProcessamento, nomeMedico, instanciaNome, contatoTelefone, estado } = entrada;
  const transporte = dependencias.transporte;
  if (!nomeMedico || !instanciaNome || !contatoTelefone || !transporte) {
    log('erro', 'COMUNICACAO_ENVIO_NAO_CONFIGURADO');
    return { tipo: 'nenhuma' };
  }
  if (!await historico.reservarEnvio(medicoId, chaveProcessamento, acao)) return { tipo: 'nenhuma' };
  const baloes = montarBoasVindas(nomeMedico, acao.ultimaNota);
  for (const [indice, texto] of baloes.entries()) {
    let confirmado = false;
    try { confirmado = (await transporte.enviarTexto({ instanciaNome, contatoTelefone, texto })).sucesso; }
    catch { /* O resultado incerto permanece reservado para impedir reenvio. */ }
    if (!confirmado) {
      log('erro', 'COMUNICACAO_TRANSPORTE_FALHOU');
      return { tipo: 'nenhuma' };
    }
    await historico.confirmarBalao(medicoId, chaveProcessamento, indice);
  }
  await historico.gravarAcao(medicoId, 'real', chaveProcessamento, acao, estado.agora.toISOString());
  return acao;
}
