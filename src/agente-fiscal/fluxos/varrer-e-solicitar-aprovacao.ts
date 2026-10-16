/**
 * Caso de uso: Agente Fiscal Proativo (Iniciativa & Varredura de Histórico).
 * Varre o histórico de conversas do médico com pacientes de hoje para trás,
 * identifica comprovantes/pagamentos sem nota emitida, correlaciona a data da consulta
 * e solicita aprovação ao médico no WhatsApp em linguagem calma e natural.
 */

import { correlacionarConsultaPagamento, type CandidatoNotaFiscal, type MensagemContextoConversa } from '../regras/correlacionar-consulta-pagamento.js';
import { redigirSolicitacaoAprovacao } from '../regras/redigir-solicitacao-aprovacao.js';
import type { PostgresCandidatosNotaRepositorio } from '../io/postgres-candidatos-nota-repositorio.js';
import type { EnviarMensagemPaciente } from '../../whatsapp/enviar-mensagem-paciente.js';
import type { PaligemmaComprovanteClient } from '../../io/nvidia/paligemma-comprovante-client.js';
import type { GeminiComprovanteClient } from '../../candidatos/io/gemini-comprovante-client.js';
import type { EvolutionApiClient } from '../../io/evolution/evolution-api-client.js';

export interface VarrerESolicitarAprovacaoDeps {
  repositorio: PostgresCandidatosNotaRepositorio;
  enviarMensagem: EnviarMensagemPaciente;
  instanciaNome: string;
  instanciaClinicaNome?: string;
  dataCorte?: Date;
  telefoneDestinoSobrescrito?: string; // Para testes manuais onde o usuário quer receber no número oficial do Noto
  ehContinuacao?: boolean;
  comprovanteClient?: PaligemmaComprovanteClient;
  geminiClient?: GeminiComprovanteClient;
  evolutionClient?: EvolutionApiClient;
}

export type ResultadoVarreduraAprovacao =
  | {
      ok: true;
      status: 'candidato_encontrado_e_notificado';
      candidato: CandidatoNotaFiscal;
      mensagemEnviada: string;
      destinatarioTelefone: string;
    }
  | {
      ok: true;
      status: 'candidato_encontrado_pendente_conexao_whatsapp';
      candidato: CandidatoNotaFiscal;
      mensagemEnviada: string;
      destinatarioTelefone: string;
      avisoConexao: string;
    }
  | {
      ok: true;
      status: 'nenhum_candidato_pendente';
      mensagem: string;
    }
  | {
      ok: false;
      motivo: string;
      erro?: string;
    };

export async function varrerESolicitarAprovacao(
  medicoId: string,
  deps: VarrerESolicitarAprovacaoDeps
): Promise<ResultadoVarreduraAprovacao> {
  const dadosMedico = await deps.repositorio.obterDadosMedico(medicoId);
  if (!dadosMedico) {
    return { ok: false, motivo: 'medico_nao_encontrado' };
  }

  const telefoneDestino = deps.telefoneDestinoSobrescrito || dadosMedico.telefone;
  if (!telefoneDestino) {
    return { ok: false, motivo: 'telefone_medico_ausente' };
  }

  if (dadosMedico.fiscalConfirmado === false || dadosMedico.parametrosProntos === false) {
    return { ok: false, motivo: 'parametros_fiscais_pendentes' };
  }

  if (dadosMedico.dadosProfissionaisConfirmados === false) {
    return { ok: false, motivo: 'dados_profissionais_pendentes' };
  }

  if (!deps.ehContinuacao) {
    const aguardandoCpf = deps.repositorio.obterAguardandoCpfMedico
      ? await deps.repositorio.obterAguardandoCpfMedico(medicoId)
      : null;
    if (aguardandoCpf) {
      return {
        ok: true,
        status: 'nenhum_candidato_pendente',
        mensagem: `Já existe solicitação aguardando CPF do paciente ${aguardandoCpf.pacienteNome}`
      };
    }

    if (deps.repositorio.obterCandidatoAguardandoAprovacao) {
      const aguardandoAprovacao = await deps.repositorio.obterCandidatoAguardandoAprovacao(medicoId);
      if (aguardandoAprovacao) {
        return {
          ok: true,
          status: 'nenhum_candidato_pendente',
          mensagem: `Já existe nota aguardando aprovação do médico para ${aguardandoAprovacao.pacienteNome}`
        };
      }
    }
  }

  const DIAS_JANELA_FATURAMENTO = 15;
  const dataCortePagamento = deps.dataCorte || new Date(Date.now() - DIAS_JANELA_FATURAMENTO * 24 * 60 * 60 * 1000);

  const conversas = await deps.repositorio.buscarConversasComHistorico(medicoId, dataCortePagamento);
  if (conversas.length === 0) {
    return {
      ok: true,
      status: 'nenhum_candidato_pendente',
      mensagem: 'Nenhuma conversa com pacientes encontrada no período'
    };
  }

  let candidatoEleito: CandidatoNotaFiscal | null = null;
  const instanciaMidia = deps.instanciaClinicaNome || deps.instanciaNome;

  for (const conv of conversas) {
    await enriquecerMidiasConversa(conv.mensagens, instanciaMidia, deps);

    const candidatos = correlacionarConsultaPagamento(
      conv.mensagens,
      conv.contatoTelefone,
      conv.pacienteNomeCadastrado || conv.contatoNome,
      new Date(),
      dadosMedico.valorPadraoCentavos,
      dataCortePagamento
    );

    for (const cand of candidatos) {
      const jaTemNota = await deps.repositorio.verificarSeJaPossuiNota(
        medicoId,
        cand.pacienteTelefone,
        cand.valorCentavos
      );

      if (!jaTemNota) {
        await resolverAmbiguidadeDataSeNecessario(cand, conv.mensagens, deps.geminiClient);
        candidatoEleito = cand;
        break;
      }
    }

    if (candidatoEleito) break;
  }


  if (!candidatoEleito) {
    return {
      ok: true,
      status: 'nenhum_candidato_pendente',
      mensagem: 'Todos os pagamentos encontrados já possuem nota fiscal ou não há comprovantes pendentes'
    };
  }

  // 4. Redigir a solicitação de aprovação no estilo natural do Noto
  const textoMensagem = redigirSolicitacaoAprovacao({
    candidato: candidatoEleito,
    nomeMedico: dadosMedico.nomeCompleto,
    ehContinuacao: deps.ehContinuacao
  });

  // 5. Salvar na memória contextual para quando o médico responder
  await deps.repositorio.salvarCandidatoAguardandoAprovacao(medicoId, candidatoEleito);

  // 6. Enviar a mensagem para o médico via WhatsApp
  const envio = await deps.enviarMensagem.enviarTexto({
    instanciaNome: deps.instanciaNome,
    contatoTelefone: telefoneDestino,
    texto: textoMensagem
  });

  if (!envio.sucesso) {
    return {
      ok: true,
      status: 'candidato_encontrado_pendente_conexao_whatsapp',
      candidato: candidatoEleito,
      mensagemEnviada: textoMensagem,
      destinatarioTelefone: telefoneDestino,
      avisoConexao: `Mensagem gerada e salva na memória contextual, mas a entrega via WhatsApp falhou: ${envio.erro || 'Instância desconectada'}`
    };
  }

  return {
    ok: true,
    status: 'candidato_encontrado_e_notificado',
    candidato: candidatoEleito,
    mensagemEnviada: textoMensagem,
    destinatarioTelefone: telefoneDestino
  };
}

async function enriquecerMidiasConversa(
  mensagens: MensagemContextoConversa[],
  instanciaMidia: string,
  deps: VarrerESolicitarAprovacaoDeps
): Promise<void> {
  if (!deps.evolutionClient || (!deps.geminiClient && !deps.comprovanteClient)) return;
  let pdfsEnviadosAnalisados = 0;

  for (const m of mensagens) {
    if (m.tipo !== 'imagem' && m.tipo !== 'documento') continue;
    const pb = m.payloadBruto as Record<string, any> | undefined;
    if (pb?.comprovante !== undefined) continue;
    if (m.direcao === 'enviada') {
      if (m.tipo !== 'documento' || pdfsEnviadosAnalisados >= 2) continue;
      if (! deps.geminiClient) continue;
      pdfsEnviadosAnalisados += 1;
    }
    await analisarMidiaMensagem(m, instanciaMidia, deps);
  }
}

async function analisarMidiaMensagem(
  m: MensagemContextoConversa,
  instanciaMidia: string,
  deps: VarrerESolicitarAprovacaoDeps
): Promise<void> {
  const pb = (m.payloadBruto || {}) as Record<string, any>;
  const keyId = pb.key?.id;
  if (!keyId || !deps.evolutionClient) return;
  try {
    const midia = await deps.evolutionClient.obterBase64MensagemMidia(instanciaMidia, keyId);
    if (!midia?.base64) return;
    const mime = midia.mimetype || (m.tipo === 'documento' ? 'application/pdf' : 'image/jpeg');
    const analise = deps.geminiClient
      ? await deps.geminiClient.analisarMidia({ base64: midia.base64, mimeType: mime })
      : await deps.comprovanteClient!.analisarImagem(midia.base64, mime === 'image/png' ? 'image/png' : 'image/jpeg');
    m.payloadBruto = { ...pb, comprovante: analise };
    if (deps.repositorio.salvarAnaliseComprovante) {
      await deps.repositorio.salvarAnaliseComprovante(m.id, analise);
    }
  } catch {
    // Falha transitória de rede/VLM não interrompe a varredura
  }
}

async function resolverAmbiguidadeDataSeNecessario(
  cand: CandidatoNotaFiscal,
  mensagens: MensagemContextoConversa[],
  geminiClient?: GeminiComprovanteClient
): Promise<void> {
  if (!cand.dataAmbigua || !geminiClient) return;
  try {
    const dataPagamentoIso = cand.dataConsultaIso.slice(0, 10);
    const historico = mensagens
      .filter(m => Boolean(m.conteudo?.trim()))
      .slice(-20)
      .map(m => ({
        direcao: m.direcao,
        texto: m.conteudo!.trim(),
        criadoEmIso: (m.criadoEm instanceof Date ? m.criadoEm : new Date(m.criadoEm)).toISOString()
      }));
    const inferida = await geminiClient.inferirDataConsultaConversa({
      mensagens: historico,
      dataPagamentoIso
    });
    if (inferida) {
      cand.dataConsulta = inferida.dataConsultaBr;
      cand.dataConsultaIso = new Date(`${inferida.dataConsultaIso}T12:00:00Z`).toISOString();
      cand.dataAmbigua = false;
    }
  } catch {
    // Mantém heurística determinística em caso de erro
  }
}

