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
      acao: 'emissao_enfileirada';
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
    const { solicitacaoId } = await deps.repositorio.enfileirarEmissaoAprovada(medicoId, candidato);
    const mensagemResposta = `Perfeito! Já coloquei a nota da paciente ${candidato.pacienteNome} (R$ ${candidato.valorFormatado}) na fila de emissão. Assim que for autorizada eu te aviso.`;

    if (deps.enviarMensagem && deps.instanciaNome && deps.telefoneMedico) {
      await deps.enviarMensagem.enviarTexto({
        instanciaNome: deps.instanciaNome,
        contatoTelefone: deps.telefoneMedico,
        texto: mensagemResposta
      });
    }

    return {
      processado: true,
      acao: 'emissao_enfileirada',
      solicitacaoId,
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
