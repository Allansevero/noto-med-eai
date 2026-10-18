interface HistoricoPergunta {
  feitaEm: string | null;
  repeticoes: number;
}
interface UltimaNotaConhecida {
  dataEmissao: string;
  valorCentavos: number;
  diasDesdeEmissao: number;
}
export interface EstadoMedicoAposOnboarding {
  fiscal: { certificado: 'ok' | 'problema'; dadosFiscais: 'ok' | 'problema' };
  agenda: { nome: string | null; conectada: boolean };
  ultimaNota: UltimaNotaConhecida | null;
  historico: {
    /** Refere-se à ocorrência fiscal atual, não a problemas anteriores já resolvidos. */
    problemaFiscalComunicado: boolean;
    boasVindasComunicadas: boolean;
    perguntaNota: HistoricoPergunta & { resposta: { temNota: boolean; desde: string | null } | null };
    perguntaAgenda: HistoricoPergunta;
    agendasNaoAtendidasComunicadas: string[];
    consultasListadas: boolean;
    aguardandoComprovanteComunicado: boolean;
  };
}
export type ProximaAcaoNoto =
  | { tipo: 'problema_fiscal'; campos: Array<'certificado' | 'dados_fiscais'> }
  | { tipo: 'boas_vindas'; ultimaNota: UltimaNotaConhecida | null }
  | { tipo: 'perguntar_nota_pendente' }
  | { tipo: 'pedir_agenda'; agendaInformada: string | null }
  | { tipo: 'agenda_nao_atendida'; agenda: string; registrarInteresse: true }
  | { tipo: 'listar_consultas_sem_nota'; agenda: 'tribemd'; desde: string | null }
  | { tipo: 'aguardar_comprovante' }
  | { tipo: 'reperguntar'; pergunta: 'nota_pendente' | 'agenda' }
  | { tipo: 'nenhuma' };

/** Histórico precisa refletir comunicações confirmadas; decidir não grava nem marca envio. */
export function decidirProximaAcao(
  estado: EstadoMedicoAposOnboarding,
  agora: Date,
  intervaloReperguntaDias: number
): ProximaAcaoNoto {
  const historico = estado.historico;
  const campos: Array<'certificado' | 'dados_fiscais'> = [];
  if (estado.fiscal.certificado === 'problema') campos.push('certificado');
  if (estado.fiscal.dadosFiscais === 'problema') campos.push('dados_fiscais');
  if (campos.length) return historico.problemaFiscalComunicado ? { tipo: 'nenhuma' } : { tipo: 'problema_fiscal', campos };
  if (!historico.boasVindasComunicadas) return { tipo: 'boas_vindas', ultimaNota: estado.ultimaNota ? { ...estado.ultimaNota } : null };
  if (!historico.perguntaNota.feitaEm) return { tipo: 'perguntar_nota_pendente' };

  const resposta = historico.perguntaNota.resposta;
  const agenda = estado.agenda.nome?.trim() || null;
  const agendaAtendida = agenda?.toLowerCase() === 'tribemd';
  if (resposta?.temNota && !estado.agenda.conectada && !historico.perguntaAgenda.feitaEm && (!agenda || agendaAtendida)) {
    return { tipo: 'pedir_agenda', agendaInformada: agenda };
  }
  if (agenda && !agendaAtendida && !historico.agendasNaoAtendidasComunicadas.some(nome => nome.trim().toLowerCase() === agenda.toLowerCase())) {
    return { tipo: 'agenda_nao_atendida', agenda, registrarInteresse: true };
  }
  if (resposta?.temNota && estado.agenda.conectada && agendaAtendida && !historico.consultasListadas) {
    return { tipo: 'listar_consultas_sem_nota', agenda: 'tribemd', desde: resposta.desde };
  }
  if (resposta?.temNota === false && !historico.aguardandoComprovanteComunicado) return { tipo: 'aguardar_comprovante' };
  if (!resposta) return decidirRepergunta(historico.perguntaNota, 'nota_pendente', agora, intervaloReperguntaDias);
  if (resposta.temNota && !estado.agenda.conectada && !agenda) {
    return decidirRepergunta(historico.perguntaAgenda, 'agenda', agora, intervaloReperguntaDias);
  }
  return { tipo: 'nenhuma' };
}

function decidirRepergunta(
  historico: HistoricoPergunta,
  pergunta: 'nota_pendente' | 'agenda',
  agora: Date,
  intervaloDias: number
): ProximaAcaoNoto {
  const intervaloMs = intervaloDias * 24 * 60 * 60 * 1000;
  if (historico.feitaEm && historico.repeticoes === 0 && Number.isFinite(intervaloMs) && intervaloMs > 0 &&
      agora.getTime() - Date.parse(historico.feitaEm) >= intervaloMs) return { tipo: 'reperguntar', pergunta };
  return { tipo: 'nenhuma' };
}
