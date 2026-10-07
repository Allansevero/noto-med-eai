/**
 * Recupera o histórico já persistido pela Evolution. Os eventos MESSAGES_SET
 * e CONTACTS_SET são emitidos uma única vez; esta consulta evita perder os
 * pacientes quando o webhook ainda não estava pronto durante a conexão.
 */

import type { AtendimentoRepositorio } from '../../atendimento/atendimento-repositorio.js';
import type { ConsultaCpfProvider } from '../../paciente/consulta-cpf-provider.js';
import { processarHistoricoWebhook } from '../../fluxos/processar-historico-webhook.js';
import {
  dadosMensagemSchema,
  type DadosMensagemEvolution
} from '../../whatsapp/payload-webhook-schema.js';

const sincronizacoes = new Map<string, Promise<ResultadoSincronizacaoEvolution>>();

export interface ResultadoSincronizacaoEvolution {
  mensagensAnalisadas: number;
  conversasAnalisadas: number;
  pacientesVinculados: number;
}

export interface SincronizarHistoricoEvolutionParams {
  baseUrl: string;
  apiKey: string;
  nomeInstancia: string;
  repositorio: AtendimentoRepositorio;
  consultaCpfProvider?: ConsultaCpfProvider;
  pepper: string;
}

export function sincronizarHistoricoEvolutionUmaVez(
  params: SincronizarHistoricoEvolutionParams
): Promise<ResultadoSincronizacaoEvolution> {
  const emAndamento = sincronizacoes.get(params.nomeInstancia);
  if (emAndamento) return emAndamento;

  const tarefa = sincronizarHistoricoEvolution(params).catch((erro) => {
    sincronizacoes.delete(params.nomeInstancia);
    throw erro;
  });
  sincronizacoes.set(params.nomeInstancia, tarefa);
  return tarefa;
}

export async function sincronizarHistoricoEvolution(
  params: SincronizarHistoricoEvolutionParams
): Promise<ResultadoSincronizacaoEvolution> {
  const mensagens: DadosMensagemEvolution[] = [];
  const baseUrl = params.baseUrl.replace(/\/+$/, '');
  let pagina = 1;
  let totalPaginas = 1;

  do {
    const resposta = await fetch(
      `${baseUrl}/chat/findMessages/${encodeURIComponent(params.nomeInstancia)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: params.apiKey
        },
        body: JSON.stringify({ page: pagina, offset: 100 }),
        signal: AbortSignal.timeout(30_000)
      }
    );

    if (!resposta.ok) {
      throw new Error(`Evolution recusou a leitura do histórico (HTTP ${resposta.status})`);
    }

    const dados = await resposta.json().catch(() => ({}));
    const paginaExtraida = extrairPaginaMensagens(dados);
    mensagens.push(...paginaExtraida.mensagens);
    totalPaginas = paginaExtraida.totalPaginas;
    pagina += 1;
  } while (pagina <= totalPaginas && pagina <= 200);

  const resultado = await processarHistoricoWebhook(
    {
      event: 'messages.set',
      instance: params.nomeInstancia,
      data: { messages: mensagens }
    },
    {
      repositorio: params.repositorio,
      consultaCpfProvider: params.consultaCpfProvider,
      pepper: params.pepper
    }
  );

  if (!resultado.ok) {
    throw new Error(`Não foi possível processar o histórico: ${resultado.motivo}`);
  }

  return {
    mensagensAnalisadas: resultado.mensagensAnalisadas,
    conversasAnalisadas: resultado.conversasAnalisadas,
    pacientesVinculados: resultado.pacientesVinculados
  };
}

export function extrairPaginaMensagens(valor: unknown): {
  mensagens: DadosMensagemEvolution[];
  totalPaginas: number;
} {
  const objeto = valor && typeof valor === 'object' ? valor as Record<string, any> : {};
  const envelope = objeto.messages && typeof objeto.messages === 'object'
    ? objeto.messages as Record<string, any>
    : objeto;
  const registrosBrutos = Array.isArray(envelope.records)
    ? envelope.records
    : Array.isArray(objeto.messages)
      ? objeto.messages
      : Array.isArray(objeto.records)
        ? objeto.records
        : [];

  const mensagens = registrosBrutos.flatMap((registro: unknown) => {
    const validado = dadosMensagemSchema.safeParse(registro);
    return validado.success ? [validado.data] : [];
  });
  const paginas = Number(envelope.pages ?? objeto.pages ?? 1);

  return {
    mensagens,
    totalPaginas: Number.isInteger(paginas) && paginas > 0 ? paginas : 1
  };
}
