/**
 * Liga os lotes de histórico entregues pela Evolution ao caso de uso que
 * encontra CPF e cadastra pacientes. O agrupamento por telefone garante que
 * cada conversa seja analisada com todo o texto disponível no lote.
 */

import type { AtendimentoRepositorio } from '../atendimento/atendimento-repositorio.js';
import type { ConsultaCpfProvider } from '../paciente/consulta-cpf-provider.js';
import { extrairTelefoneJid } from '../whatsapp/extrair-telefone-jid.js';
import {
  extrairTextoMensagem,
  extrairTipoMensagem,
  type DadosMensagemEvolution
} from '../whatsapp/payload-webhook-schema.js';
import { extrairPayloadHistorico } from '../whatsapp/payload-historico-webhook-schema.js';
import { sincronizarHistoricoConversa } from './sincronizar-historico-conversa.js';

export interface ProcessarHistoricoWebhookDeps {
  repositorio: AtendimentoRepositorio;
  consultaCpfProvider?: ConsultaCpfProvider;
  pepper: string;
}

export type ResultadoProcessarHistoricoWebhook =
  | {
      ok: true;
      acao: 'historico_sincronizado';
      mensagensAnalisadas: number;
      conversasAnalisadas: number;
      pacientesVinculados: number;
    }
  | { ok: false; motivo: 'payload_invalido' | 'instancia_nao_encontrada' };

export async function processarHistoricoWebhook(
  payloadBruto: unknown,
  deps: ProcessarHistoricoWebhookDeps
): Promise<ResultadoProcessarHistoricoWebhook> {
  const payload = extrairPayloadHistorico(payloadBruto);
  if (!payload) return { ok: false, motivo: 'payload_invalido' };

  const instancia = await deps.repositorio.buscarInstanciaPorNome(payload.instance);
  if (!instancia) return { ok: false, motivo: 'instancia_nao_encontrada' };

  const mensagensPorTelefone = agruparMensagensPorTelefone(payload.mensagens);
  let pacientesVinculados = 0;

  for (const [telefone, historico] of mensagensPorTelefone) {
    const conversa = await deps.repositorio.buscarOuCriarConversa(
      instancia.id,
      instancia.medicoId,
      telefone,
      historico.nomeContato
    );
    const resultado = await sincronizarHistoricoConversa(
      conversa,
      historico.mensagens,
      deps,
      historico.nomeContato
    );
    if (resultado.pacienteVinculado) pacientesVinculados += 1;

    // Persistir histórico real de mensagens na tabela whatsapp_mensagens
    if (deps.repositorio.salvarMensagem) {
      for (const msg of historico.mensagensCompletas) {
        const texto = extrairTextoMensagem(msg) || '';
        const tipo = extrairTipoMensagem(msg);
        const timestampMs = typeof msg.messageTimestamp === 'number'
          ? (msg.messageTimestamp > 1e11 ? msg.messageTimestamp : msg.messageTimestamp * 1000)
          : (typeof msg.messageTimestamp === 'string' ? Number(msg.messageTimestamp) * 1000 : Date.now());

        await deps.repositorio.salvarMensagem({
          conversaId: conversa.id,
          direcao: msg.key.fromMe ? 'enviada' : 'recebida',
          tipoMensagem: tipo,
          conteudo: texto,
          payloadBruto: msg,
          criadoEm: new Date(timestampMs)
        });
      }
    }
  }

  return {
    ok: true,
    acao: 'historico_sincronizado',
    mensagensAnalisadas: payload.mensagens.length,
    conversasAnalisadas: mensagensPorTelefone.size,
    pacientesVinculados
  };
}

interface GrupoHistorico {
  mensagens: string[];
  mensagensCompletas: DadosMensagemEvolution[];
  nomeContato: string | null;
}

function agruparMensagensPorTelefone(
  mensagens: DadosMensagemEvolution[]
): Map<string, GrupoHistorico> {
  const agrupadas = new Map<string, GrupoHistorico>();

  for (const mensagem of mensagens) {
    const telefone =
      extrairTelefoneJid(mensagem.key.remoteJidAlt) ||
      extrairTelefoneJid(mensagem.key.remoteJid);
    if (!telefone) continue;

    const atual = agrupadas.get(telefone) ?? {
      mensagens: [],
      mensagensCompletas: [],
      nomeContato: null
    };

    atual.mensagensCompletas.push(mensagem);
    const texto = extrairTextoMensagem(mensagem);
    if (texto) atual.mensagens.push(texto);
    if (!mensagem.key.fromMe && mensagem.pushName?.trim()) {
      atual.nomeContato = mensagem.pushName.trim();
    }
    agrupadas.set(telefone, atual);
  }

  return agrupadas;
}
