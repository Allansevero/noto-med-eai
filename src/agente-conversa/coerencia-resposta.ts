import type { EstadoContextual } from './decisao-assistente.js';
/** Barreiras para os erros observados; o guia continua responsável pela linguagem natural. */
export function inconsistenciasResposta(mensagens: string[], estado: EstadoContextual, resultados: unknown[]): string[] {
  const texto = mensagens.join(' ').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const erros = new Set<string>();
  const pedido = /(?:me passa|me manda|informe|preciso|pode (?:me )?(?:passar|enviar|informar)|qual (?:e|o))/;
  if (estado.crmInformado && new RegExp('(?:' + pedido.source + ')[^.?!]{0,120}\\bcrm\\b').test(texto)) erros.add('CRM_JA_SALVO');
  if (estado.nomeConfirmado && pedido.test(texto) && /nome completo/.test(texto) && !/nome completo (?:do paciente|da secretaria)/.test(texto) && !(estado.interlocutor?.papel === 'secretaria' && /seu nome completo/.test(texto))) erros.add('NOME_JA_SALVO');
  for (const r of resultados as Array<{ campo?: string; estado?: string }>) {
    if (!['rejeitado', 'rejeitada'].includes(r.estado || '')) continue;
    if (r.campo === 'rqe' && estado.rqeInformado === undefined && /(?:seguimos sem|siga sem|dispensad|sem (?:o )?rqe|rqe.*(?:salvo|registrado|confirmado))/.test(texto)) erros.add('RQE_NAO_REGISTRADO');
    if (r.campo === 'crm' && !estado.crmInformado && /(?:ja entra|crm.*(?:salvo|registrado|confirmado)|dados.*salvos)/.test(texto)) erros.add('CRM_NAO_REGISTRADO');
    if ((r.campo === 'nome' || r.campo === 'evidencia') && !estado.nomeConfirmado && /(?:nome.*(?:confirmado|salvo|registrado)|cadastro.*salvo|dados.*salvos)/.test(texto)) erros.add('NOME_NAO_REGISTRADO');
  }
  return [...erros];
}
