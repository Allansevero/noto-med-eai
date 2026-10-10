/**
 * Caso de uso: Consolidação inteligente de agendamento usando IA com fallback determinístico.
 * Tenta enriquecer a extração com linguagem natural para datas relativas e nomes,
 * recorrendo com segurança a regex caso a IA demore ou não esteja disponível.
 */

import {
  consolidarDadosAgendamento,
  type DadosAgendamentoExtraidos
} from './extrair-dados-agendamento.js';
import type { ExtratorIaService, DadosExtracaoIa } from '../ia/extrator-ia-service.js';

export interface ExtrairDadosIaDeps {
  iaService?: ExtratorIaService;
  agora?: Date;
}

export async function extrairDadosAgendamentoComIa(
  mensagensRecentes: string[],
  deps: ExtrairDadosIaDeps = {}
): Promise<DadosAgendamentoExtraidos> {
  const agora = deps.agora || new Date();
  const dadosHeuristicos = consolidarDadosAgendamento(mensagensRecentes, agora);

  if (!deps.iaService || mensagensRecentes.length === 0) {
    return dadosHeuristicos;
  }

  const textoUnificado = mensagensRecentes.join('\n');
  try {
    const dadosIa = await deps.iaService.extrairDados(textoUnificado, agora);
    return mesclarDadosHeuristicosEIA(dadosHeuristicos, dadosIa);
  } catch {
    return dadosHeuristicos;
  }
}

export function mesclarDadosHeuristicosEIA(
  heuris: DadosAgendamentoExtraidos,
  ia: DadosExtracaoIa
): DadosAgendamentoExtraidos {
  let dataHoraFinal = heuris.dataHora;
  if (ia.dataHoraIso) {
    const dataIa = new Date(ia.dataHoraIso);
    if (!Number.isNaN(dataIa.getTime())) {
      dataHoraFinal = dataIa;
    }
  }

  return {
    dataHora: dataHoraFinal,
    valorConsultaCentavos: ia.valorConsultaCentavos ?? heuris.valorConsultaCentavos ?? null,
    nomePaciente: ia.nomePaciente ?? heuris.nomePaciente ?? null,
    emailPaciente: ia.emailPaciente ?? heuris.emailPaciente ?? null,
    cpfPaciente: ia.cpfPaciente ?? heuris.cpfPaciente ?? null
  };
}
