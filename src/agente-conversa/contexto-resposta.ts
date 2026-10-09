import type { EstadoContextual } from './decisao-assistente.js';
import { identificarInterlocutor } from '../onboarding/regras/identificar-interlocutor.js';
const normal = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
/** A referência vem de mensagens confirmadas, nunca de uma pergunta que a IA ainda pretende enviar. */
export function contextualizarResposta(
  estado: EstadoContextual, historico: Array<{ papel: 'medico' | 'noto'; texto: string }>, texto: string
): EstadoContextual {
  const interlocutor = identificarInterlocutor(texto);
  let indice = -1;
  for (let i = historico.length - 1; i >= 0; i--) {
    if (historico[i].papel === 'noto') { indice = i; break; }
  }
  let perguntaPendente = estado.perguntaPendente;
  if (indice >= 0) {
    let inicio = indice;
    while (inicio > 0 && historico[inicio - 1].papel === 'noto') inicio--;
    const completa = normal(historico.slice(inicio, indice + 1).map(m => m.texto).join(' '));
    const solicitacao = completa.split(/(?<=[.!?])\s+/u).reverse().find(frase =>
      /(?:\?|me passa|me manda|me diz|informe|se (?:quiser|preferir)|pode (?:me )?(?:enviar|informar|passar))/.test(frase)
    ) || '';
    const marcadores = [...solicitacao.matchAll(/\b(?:qual|quais|quanto tempo|quantos|me (?:passa|manda|diz)|informe|pode (?:me )?(?:enviar|informar|passar)|quer (?:incluir|informar|seguir|usar)|prefere)\b/g)];
    const trecho = marcadores.length ? solicitacao.slice(marcadores.at(-1)!.index) : solicitacao;
    const topico = (t: string): EstadoContextual['perguntaPendente'] =>
      /\brqe\b/.test(t) ? 'rqe'
        : /\bcrm\b/.test(t) ? 'crm'
        : /nome completo/.test(t) && !/paciente/.test(t) ? 'nome_profissional'
        : /(?:periodo|quanto tempo|ultimos|janela)/.test(t) ? 'periodo'
        : /(?:data da consulta|comprovante)/.test(t) && /(?:prefere|preferencia|confirmar|perguntar|usar)/.test(t) ? 'preferencia' : null;
    perguntaPendente = topico(trecho);
    // Referências como "Quer incluir?" usam o antecedente do mesmo grupo de mensagens enviado.
    if (!perguntaPendente && /(?:incluir|informar|passar|enviar|me passa|numero|seguir sem|deixar de fora)/.test(trecho) && !/paciente/.test(trecho))
      perguntaPendente = topico(completa);
  }
  return { ...estado, perguntaPendente,
    ...(interlocutor.papel !== 'desconhecido' ? { interlocutor: { papel: interlocutor.papel, nomeInformado: interlocutor.nomeInformado } } : {}) };
}
