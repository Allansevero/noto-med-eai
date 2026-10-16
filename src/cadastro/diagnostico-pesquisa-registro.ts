/** Diagnósticos persistíveis: apenas etapas, contagens e motivos estáticos. */
export type DiagnosticoPesquisaRegistro =
  | { etapa: 'serper' | 'openserp'; resultados: number; fontesUtilizaveis: number; fontesComMencaoRqe: number }
  | { etapa: 'openserp_http'; status: number }
  | { etapa: 'serper_http'; status: number; motivo: 'CONSULTA_AUSENTE' | 'CREDENCIAL_RECUSADA' | 'CREDITOS_INSUFICIENTES' | 'LIMITE_REQUISICOES' | 'PARAMETROS_RECUSADOS' | 'ERRO_NAO_CLASSIFICADO' | 'CORPO_NAO_JSON' | 'CORPO_LIMITE_EXCEDIDO' | 'CORPO_INDISPONIVEL' }
  | { etapa: 'nvidia'; candidatos: number }
  | { etapa: 'nvidia_http'; status: number }
  | { etapa: 'nvidia_rqe'; candidato: number; candidatos: number }
  | { etapa: 'fontes_rqe'; candidato: number; fontesComNomeECrm: number; fontesComNomeCrmERqe: number }
  | { etapa: 'validacao_crm'; candidato: number; motivo: string }
  | { etapa: 'validacao_rqe'; candidato: number; indiceRqe?: number; motivo: string };
