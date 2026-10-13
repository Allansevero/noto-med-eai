/** Diagnósticos persistíveis: apenas etapas, contagens e motivos estáticos. */
export type DiagnosticoPesquisaRegistro =
  | { etapa: 'serper'; resultados: number; fontesUtilizaveis: number; fontesComMencaoRqe: number }
  | { etapa: 'nvidia'; candidatos: number }
  | { etapa: 'nvidia_rqe'; candidato: number; candidatos: number }
  | { etapa: 'fontes_rqe'; candidato: number; fontesComNomeECrm: number; fontesComNomeCrmERqe: number }
  | { etapa: 'validacao_crm'; candidato: number; motivo: string }
  | { etapa: 'validacao_rqe'; candidato: number; indiceRqe?: number; motivo: string };
