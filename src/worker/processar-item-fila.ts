/**
 * Caso de uso: Processamento individual de um item da fila de emissão de NFS-e.
 * Orquestra tentativas, gravação de nota autorizada, envio do PDF ao paciente
 * e notificações de falha ao médico ou desenvolvedor (seção 3.2, itens 5 a 8).
 */

import type { DadosProfissionaisService } from '../conta/dados-profissionais-service.js';
import { investigarFalha, type AgenteFiscalDeps } from '../agente-fiscal/investigar-falha.js';
import { formatarMotivoFalhaEmissao } from './formatar-motivo-falha-emissao.js';
import type { FalhaEmissao } from '../agente-fiscal/investigacao.js';
import {
  excedeuTentativasEmissao,
  calcularProximaTentativa
} from './calcular-proxima-tentativa.js';
import type { ItemFilaComTentativas, FilaRepositorio } from './fila-repositorio.js';
import type { EmissorDpsService } from './emissor-dps-service.js';
import type { EnviarPdfDanfse } from '../whatsapp/enviar-pdf-danfse.js';
import type { NotificadorAlertas } from './notificar-erro-medico.js';

export interface ProcessarItemFilaDeps {
  filaRepositorio: FilaRepositorio;
  emissorDps: EmissorDpsService;
  enviarPdfDanfse: EnviarPdfDanfse;
  notificadorAlertas: NotificadorAlertas;
  agora?: () => Date;
  agenteFiscal?: AgenteFiscalDeps;
  dadosProfissionais?: DadosProfissionaisService;
}

export type ResultadoProcessarItem =
  | { ok: true; status: 'emitida'; chaveAcesso: string }
  | { ok: false; status: 'reagendada' | 'erro_definitivo' | 'erro_inesperado' | 'necessita_intervencao' | 'aguardando_dados_profissionais'; motivo?: string };

export async function processarItemFila(
  item: ItemFilaComTentativas,
  deps: ProcessarItemFilaDeps
): Promise<ResultadoProcessarItem> {
  const dataAtual = deps.agora ? deps.agora() : new Date();
  const tentativaAtual = item.tentativas + 1;

  if (deps.agenteFiscal) return processarComAgente(item, deps);

  try {
    const emissao = await deps.emissorDps.emitir(item);
    if (emissao.sucesso) {
      await tratarSucessoEmissao(item, emissao, deps);
      return { ok: true, status: 'emitida', chaveAcesso: emissao.chaveAcesso };
    }
    if (emissao.dadosProfissionaisPendentes) return aguardarDadosProfissionais(item, deps);
    return tratarFalhaEmissao(item, tentativaAtual, emissao.erro, dataAtual, deps);
  } catch (erro: any) {
    return tratarExcecaoInesperada(item, tentativaAtual, erro, dataAtual, deps);
  }
}

async function tratarSucessoEmissao(item: ItemFilaComTentativas, emissao: any, deps: ProcessarItemFilaDeps): Promise<void> {
  await deps.filaRepositorio.registrarSucesso({
    solicitacaoId: item.id,
    medicoId: item.medicoId,
    chaveAcesso: emissao.chaveAcesso,
    ndps: emissao.ndps,
    serie: emissao.serie,
    competencia: emissao.competencia,
    dataEmissao: emissao.dataEmissao,
    valorServicosCentavos: emissao.valorServicosCentavos,
    xmlStoragePath: emissao.xmlStoragePath,
    pdfStoragePath: emissao.pdfStoragePath,
    respostaSefinRaw: emissao.respostaSefinRaw
  });

  const contexto = await deps.filaRepositorio.buscarContextoEnvio(item.id);
  if (!contexto && deps.agenteFiscal) throw new Error('Contato para entrega não localizado');
  if (contexto) {
    const entrega = await deps.enviarPdfDanfse.enviarPdf({
      instanciaNome: contexto.instanciaNome,
      contatoTelefone: contexto.contatoTelefone,
      pdfPathOuUrl: emissao.pdfStoragePath,
      nomeArquivo: `DANFSe-${emissao.ndps}.pdf`
    });
    if (deps.agenteFiscal && !entrega.sucesso) throw new Error('Entrega do PDF pendente');
  }
}

async function tratarFalhaEmissao(
  item: ItemFilaComTentativas,
  tentativaAtual: number,
  erro: string,
  dataAtual: Date,
  deps: ProcessarItemFilaDeps
): Promise<ResultadoProcessarItem> {
  if (excedeuTentativasEmissao(tentativaAtual)) {
    await deps.filaRepositorio.marcarFalhaDefinitiva({ solicitacaoId: item.id, tentativas: tentativaAtual, erro });
    const contexto = await deps.filaRepositorio.buscarContextoEnvio(item.id);
    if (contexto) {
      await deps.notificadorAlertas.notificarMedicoWhatsApp({
        telefoneMedico: contexto.telefoneMedico, medicoId:item.medicoId, solicitacaoId:item.id,
        nomePaciente: contexto.nomePaciente,
        valorCentavos: item.valorServicoCentavos,
        motivoErro: erro
      });
    }
    return { ok: false, status: 'erro_definitivo', motivo: erro };
  }

  const proximaTentativaEm = calcularProximaTentativa(tentativaAtual, dataAtual);
  await deps.filaRepositorio.reagendarTentativa({ solicitacaoId: item.id, tentativas: tentativaAtual, proximaTentativaEm, erro });
  return { ok: false, status: 'reagendada', motivo: erro };
}

async function tratarExcecaoInesperada(
  item: ItemFilaComTentativas,
  tentativaAtual: number,
  erro: any,
  dataAtual: Date,
  deps: ProcessarItemFilaDeps
): Promise<ResultadoProcessarItem> {
  const mensagemErro = erro?.message || 'Erro inesperado';
  await deps.notificadorAlertas.notificarDesenvolvedorEmail({
    assunto: `[NFS-e Alerta] Exceção no processamento da solicitação ${item.id}`,
    detalhesErro: String(erro?.stack || erro),
    solicitacaoId: item.id,
    medicoId: item.medicoId
  });
  return tratarFalhaEmissao(item, tentativaAtual, mensagemErro, dataAtual, deps);
}

/** Mantém exceções do agente fora do catch que reagenda emissões legadas. */
async function processarComAgente(item: ItemFilaComTentativas, deps: ProcessarItemFilaDeps): Promise<ResultadoProcessarItem> {
  let emissao;
  try {
    emissao = await deps.emissorDps.emitir(item);
  } catch {
    emissao = { sucesso: false as const, erro: 'Falha inesperada; resultado da transmissão desconhecido.' };
  }
  if (!emissao.sucesso && emissao.dadosProfissionaisPendentes) return aguardarDadosProfissionais(item, deps);
  if (!emissao.sucesso) return tratarComAgente(item, emissao, deps);
  try {
    await tratarSucessoEmissao(item, emissao, deps);
    return { ok: true, status: 'emitida', chaveAcesso: emissao.chaveAcesso };
  } catch {
    // Nunca converter erro de gravação/entrega após autorização em nova emissão.
    return tratarComAgente(item, { sucesso: false,
      erro: 'Autorização recebida; falha na persistência ou entrega. Conciliar sem retransmitir.',
      contextoTecnico: { chaveAcesso: emissao.chaveAcesso, etapa: 'pos_autorizacao' }
    }, deps);
  }
}
async function tratarComAgente(item: ItemFilaComTentativas, falha: FalhaEmissao, deps: ProcessarItemFilaDeps): Promise<ResultadoProcessarItem> {
  const resultado = await investigarFalha({ item, falha }, {
    ...deps.agenteFiscal!, emissor: deps.emissorDps,
    concluir: (nota) => tratarSucessoEmissao(item, nota, deps),
    notificar: async (decisao) => {
      if (decisao.responsavel === 'desenvolvedor') {
        await deps.notificadorAlertas.notificarDesenvolvedorEmail({
          assunto: `[Incidente Fiscal] ${decisao.motivo} (Solicitação ${item.id})`,
          detalhesErro: `Falha técnica de competência dos desenvolvedores: ${decisao.motivo}\nAção recomendada: ${decisao.acaoSugerida}\nDetalhes do erro: ${formatarMotivoFalhaEmissao(falha)}`,
          solicitacaoId: item.id,
          medicoId: item.medicoId
        });
        return;
      }
      const contexto = await deps.filaRepositorio.buscarContextoEnvio(item.id);
      if (!contexto) throw new Error('Contato do médico não localizado');
      await deps.notificadorAlertas.notificarMedicoWhatsApp({
        telefoneMedico: contexto.telefoneMedico, medicoId: item.medicoId, solicitacaoId: item.id, nomePaciente: contexto.nomePaciente,
        valorCentavos: item.valorServicoCentavos,
        motivoErro: formatarMotivoFalhaEmissao(falha),
        pendenciasFiscais: falha.pendenciasFiscais
      });
    }
  });
  return resultado ? { ok: true, status: 'emitida', chaveAcesso: resultado.chaveAcesso }
    : { ok: false, status: 'necessita_intervencao' };
}

async function aguardarDadosProfissionais(item: ItemFilaComTentativas, deps: ProcessarItemFilaDeps): Promise<ResultadoProcessarItem> {
  if (!deps.filaRepositorio.suspenderPorDadosProfissionais) throw new Error('Controle de dados profissionais indisponível.');
  await deps.filaRepositorio.suspenderPorDadosProfissionais(item.id);
  await deps.dadosProfissionais?.solicitar(item.medicoId);
  await deps.dadosProfissionais?.retomar(item.medicoId);
  return { ok: false, status: 'aguardando_dados_profissionais' };
}
