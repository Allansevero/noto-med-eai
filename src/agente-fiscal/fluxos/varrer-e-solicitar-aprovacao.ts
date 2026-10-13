/**
 * Caso de uso: Agente Fiscal Proativo (Iniciativa & Varredura de Histórico).
 * Varre o histórico de conversas do médico com pacientes de hoje para trás,
 * identifica comprovantes/pagamentos sem nota emitida, correlaciona a data da consulta
 * e solicita aprovação ao médico no WhatsApp em linguagem calma e natural.
 */

import { correlacionarConsultaPagamento, type CandidatoNotaFiscal } from '../regras/correlacionar-consulta-pagamento.js';
import { redigirSolicitacaoAprovacao } from '../regras/redigir-solicitacao-aprovacao.js';
import type { PostgresCandidatosNotaRepositorio } from '../io/postgres-candidatos-nota-repositorio.js';
import type { EnviarMensagemPaciente } from '../../whatsapp/enviar-mensagem-paciente.js';

export interface VarrerESolicitarAprovacaoDeps {
  repositorio: PostgresCandidatosNotaRepositorio;
  enviarMensagem: EnviarMensagemPaciente;
  instanciaNome: string;
  dataCorte?: Date;
  telefoneDestinoSobrescrito?: string; // Para testes manuais onde o usuário quer receber no número oficial do Noto
  ehContinuacao?: boolean;
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

  // Não solicita aprovação de notas se o médico ainda tiver pendências fiscais na conta
  if (dadosMedico.fiscalConfirmado === false || dadosMedico.parametrosProntos === false) {
    return { ok: false, motivo: 'parametros_fiscais_pendentes' };
  }

  // 1. Buscar histórico de conversas com pacientes
  const conversas = await deps.repositorio.buscarConversasComHistorico(medicoId, deps.dataCorte);
  if (conversas.length === 0) {
    return {
      ok: true,
      status: 'nenhum_candidato_pendente',
      mensagem: 'Nenhuma conversa com pacientes encontrada no período'
    };
  }

  // 2. Correlacionar consultas e pagamentos de todas as conversas
  let candidatoEleito: CandidatoNotaFiscal | null = null;

  for (const conv of conversas) {
    const candidatos = correlacionarConsultaPagamento(
      conv.mensagens,
      conv.contatoTelefone,
      conv.pacienteNomeCadastrado || conv.contatoNome,
      new Date(),
      dadosMedico.valorPadraoCentavos
    );

    for (const cand of candidatos) {
      // 3. Verificar se já possui nota emitida ou pendente
      const jaTemNota = await deps.repositorio.verificarSeJaPossuiNota(
        medicoId,
        cand.pacienteTelefone,
        cand.valorCentavos
      );

      if (!jaTemNota) {
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
