/**
 * Roteador e processador de comandos fiscais enviados pelo médico no WhatsApp.
 * Suporta consultas sob demanda ("Tem notas pendentes?", "Notas de hoje")
 * e respostas de aprovação ("Pode emitir", "Sim", "Não").
 * Isola a interpretação de intenções e orquestra a ação correspondente.
 */

import { varrerESolicitarAprovacao, type ResultadoVarreduraAprovacao } from './varrer-e-solicitar-aprovacao.js';
import { processarRespostaAprovacaoMedico, ehRespostaAfirmativa, ehRespostaNegativa, type ResultadoProcessarRespostaAprovacao } from './processar-resposta-aprovacao-medico.js';
import type { PostgresCandidatosNotaRepositorio } from '../io/postgres-candidatos-nota-repositorio.js';
import type { EnviarMensagemPaciente } from '../../whatsapp/enviar-mensagem-paciente.js';

export interface ProcessarComandoFiscalDeps {
  repositorio: PostgresCandidatosNotaRepositorio;
  enviarMensagem: EnviarMensagemPaciente;
  instanciaNome: string;
}

export type ResultadoComandoFiscal =
  | {
      tratado: true;
      tipo: 'consulta_sob_demanda';
      resultadoVarredura: ResultadoVarreduraAprovacao;
    }
  | {
      tratado: true;
      tipo: 'resposta_aprovacao';
      resultadoAprovacao: ResultadoProcessarRespostaAprovacao;
      proximaVarredura?: ResultadoVarreduraAprovacao;
    }
  | {
      tratado: false;
    };

export async function processarComandoFiscalMedico(
  medicoId: string,
  textoRecebido: string,
  telefoneMedico: string,
  deps: ProcessarComandoFiscalDeps
): Promise<ResultadoComandoFiscal> {
  const texto = textoRecebido.trim();

  // 1. Verificar se é consulta sob demanda sobre notas ou comprovantes
  if (ehConsultaNotasSobDemanda(texto)) {
    const resVarredura = await varrerESolicitarAprovacao(medicoId, {
      repositorio: deps.repositorio,
      enviarMensagem: deps.enviarMensagem,
      instanciaNome: deps.instanciaNome,
      telefoneDestinoSobrescrito: telefoneMedico
    });

    if (resVarredura.ok && resVarredura.status === 'nenhum_candidato_pendente') {
      const dadosMed = await deps.repositorio.obterDadosMedico(medicoId);
      const saudacao = dadosMed?.nomeCompleto ? `Oi, Dr(a). ${dadosMed.nomeCompleto.split(/\s+/)[0]}!` : 'Oi!';
      const mensagemVazia = `${saudacao} Consultei os atendimentos recentes e não encontrei nenhum comprovante pendente de nota fiscal no momento. Tudo certinho por aqui!`;

      await deps.enviarMensagem.enviarTexto({
        instanciaNome: deps.instanciaNome,
        contatoTelefone: telefoneMedico,
        texto: mensagemVazia
      });
    }

    return {
      tratado: true,
      tipo: 'consulta_sob_demanda',
      resultadoVarredura: resVarredura
    };
  }

  // 2. Verificar se há candidato aguardando resposta e o médico está respondendo (sim/não)
  if (ehRespostaAfirmativa(texto) || ehRespostaNegativa(texto)) {
    const resAprovacao = await processarRespostaAprovacaoMedico(medicoId, texto, {
      repositorio: deps.repositorio,
      enviarMensagem: deps.enviarMensagem,
      instanciaNome: deps.instanciaNome,
      telefoneMedico
    });

    if (resAprovacao.processado) {
      // Loop contínuo: buscar e notificar o próximo candidato pendente até zerar
      const proximaVarredura = await varrerESolicitarAprovacao(medicoId, {
        repositorio: deps.repositorio,
        enviarMensagem: deps.enviarMensagem,
        instanciaNome: deps.instanciaNome,
        telefoneDestinoSobrescrito: telefoneMedico,
        ehContinuacao: true
      });

      if (proximaVarredura.ok && proximaVarredura.status === 'nenhum_candidato_pendente') {
        await deps.enviarMensagem.enviarTexto({
          instanciaNome: deps.instanciaNome,
          contatoTelefone: telefoneMedico,
          texto: 'Pronto! Todas as notas pendentes foram processadas por hoje.'
        });
      }

      return {
        tratado: true,
        tipo: 'resposta_aprovacao',
        resultadoAprovacao: resAprovacao,
        proximaVarredura
      };
    }
  }

  return { tratado: false };
}

export function ehConsultaNotasSobDemanda(texto: string): boolean {
  const normal = texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();

  // 1. Fechamento explícito
  if (/\bfechamento\b/i.test(normal)) return true;

  // 2. Ação, contexto ou qualificador associado a notas/comprovantes/recibos
  const temAlvo = /\b(?:notas?|nfse?|comprovantes?|recibos?)\b/i.test(normal);
  const temAcaoOuContexto = /\b(?:tem|ha|existe|alguma|ver|ve|olha|olhar|consulta|consultar|busca|buscar|lista|listar|checa|checar|confere|conferir|verifica|verificar|gera|gerar|emite|emitir|roda|rodar|puxa|puxar|aciona|acionar|fazer|faz|processar|como\s+estao|e\s+as)\b/i.test(normal);
  const temQualificador = /\b(?:hoje|agora|pendente|pendentes|pendencia|pendencias|atrasadas?|recente|recentes)\b/i.test(normal);

  if (temAlvo && (temAcaoOuContexto || temQualificador)) return true;

  // 3. Gatilhos curtos diretos de emissão/fechamento
  if (/\b(?:emitir|gerar|fechar)\s+(?:agora|tudo|hoje)\b/i.test(normal)) return true;

  return false;
}

