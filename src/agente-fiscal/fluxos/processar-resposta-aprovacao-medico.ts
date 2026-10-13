/**
 * Processamento contextual da resposta de aprovação do médico.
 * Interpreta afirmações naturais ("pode emitir", "sim", "confirmo", "emite")
 * ou recusas ("não", "espera"), enfileira a nota e responde com humanidade.
 */

import type { PostgresCandidatosNotaRepositorio } from '../io/postgres-candidatos-nota-repositorio.js';
import type { EnviarMensagemPaciente } from '../../whatsapp/enviar-mensagem-paciente.js';

export interface ProcessarRespostaAprovacaoDeps {
  repositorio: PostgresCandidatosNotaRepositorio;
  enviarMensagem?: EnviarMensagemPaciente;
  instanciaNome?: string;
  telefoneMedico?: string;
}

export type ResultadoProcessarRespostaAprovacao =
  | {
      processado: true;
      acao: 'emissao_enfileirada' | 'emissao_aguardando_cpf';
      solicitacaoId: string;
      pacienteNome: string;
      mensagemResposta: string;
    }
  | {
      processado: true;
      acao: 'emissao_recusada';
      pacienteNome: string;
      mensagemResposta: string;
    }
  | {
      processado: false;
      motivo: 'sem_candidato_pendente' | 'resposta_nao_reconhecida';
    };

export async function processarRespostaAprovacaoMedico(
  medicoId: string,
  textoResposta: string,
  deps: ProcessarRespostaAprovacaoDeps
): Promise<ResultadoProcessarRespostaAprovacao> {
  const candidato = await deps.repositorio.obterCandidatoAguardandoAprovacao(medicoId);
  if (!candidato) {
    return { processado: false, motivo: 'sem_candidato_pendente' };
  }

  const texto = textoResposta.trim().toLowerCase();

  // 1. Resposta afirmativa (sim, pode emitir, emite, por favor, claro, confirmo, ok)
  if (ehRespostaAfirmativa(texto)) {
    const resEnfileirar = await deps.repositorio.enfileirarEmissaoAprovada(medicoId, candidato);
    let mensagemResposta: string;

    if (resEnfileirar.aguardandoCpf) {
      mensagemResposta = `Perfeito! Como ainda não temos o CPF de ${candidato.pacienteNome} cadastrado, deixei a solicitação criada e enviei uma mensagem solicitando o CPF no WhatsApp. Assim que o paciente responder, a nota será emitida automaticamente e eu te aviso!`;

      // Envia solicitação humanizada de CPF diretamente ao WhatsApp do paciente
      if (deps.enviarMensagem && deps.instanciaNome && resEnfileirar.pacienteTelefone) {
        const primeiroNome = candidato.pacienteNome.trim().split(/\s+/)[0] || '';
        const saudacao = primeiroNome && primeiroNome !== 'Paciente' ? `Olá, ${primeiroNome}!` : 'Olá!';
        try {
          await deps.enviarMensagem.enviarTexto({
            instanciaNome: deps.instanciaNome,
            contatoTelefone: resEnfileirar.pacienteTelefone,
            texto: `${saudacao} Para eu emitir sua nota fiscal da consulta, você poderia me confirmar seu CPF por favor?`
          });
        } catch (e) {
          console.warn('[processarRespostaAprovacaoMedico] Falha ao enviar pedido de CPF:', e);
        }
      }
    } else {
      mensagemResposta = `Perfeito! Já coloquei a nota da paciente ${candidato.pacienteNome} (R$ ${candidato.valorFormatado}) na fila de emissão. Assim que for autorizada eu te aviso.`;
    }

    if (deps.enviarMensagem && deps.instanciaNome && deps.telefoneMedico) {
      await deps.enviarMensagem.enviarTexto({
        instanciaNome: deps.instanciaNome,
        contatoTelefone: deps.telefoneMedico,
        texto: mensagemResposta
      });
    }

    return {
      processado: true,
      acao: resEnfileirar.aguardandoCpf ? 'emissao_aguardando_cpf' : 'emissao_enfileirada',
      solicitacaoId: resEnfileirar.solicitacaoId,
      pacienteNome: candidato.pacienteNome,
      mensagemResposta
    };
  }

  // 2. Resposta negativa (não, cancela, espera, agora não, deixa)
  if (ehRespostaNegativa(texto)) {
    if (deps.repositorio.dispensarCandidato) {
      await deps.repositorio.dispensarCandidato(medicoId, candidato);
    }
    const mensagemResposta = `Tudo bem! Cancelei a emissão da nota da paciente ${candidato.pacienteNome}.`;

    if (deps.enviarMensagem && deps.instanciaNome && deps.telefoneMedico) {
      await deps.enviarMensagem.enviarTexto({
        instanciaNome: deps.instanciaNome,
        contatoTelefone: deps.telefoneMedico,
        texto: mensagemResposta
      });
    }

    return {
      processado: true,
      acao: 'emissao_recusada',
      pacienteNome: candidato.pacienteNome,
      mensagemResposta
    };
  }

  return { processado: false, motivo: 'resposta_nao_reconhecida' };
}

export function ehRespostaAfirmativa(texto: string): boolean {
  const normal = texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();

  return (
    /^(?:s|sim|claro|pode|pode emitir|pode sim|emite|emitir|confirmo|confirmar|manda ver|gera|gerar|ok|beleza|show|por favor|faz)\b/i.test(
      normal
    ) || /\b(?:pode emitir|pode gerar|confirmo|emite)\b/i.test(normal)
  );
}

export function ehRespostaNegativa(texto: string): boolean {
  const normal = texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();

  return (
    /^(?:n|nao|n[aã]o|deixa|cancela|cancelar|espera|agora nao|ainda nao|depois)\b/i.test(
      normal
    ) || /\b(?:nao emite|n[aã]o precisa|cancela)\b/i.test(normal)
  );
}
