/** Evidências de consulta são informativas e nunca constituem uma política de emissão. */
export type ValorComparavel = string | number | boolean | null;
export type CamposFiscais = Record<string, ValorComparavel>;
export interface ConsultaExterna {
  fonte: string;
  estado: 'consultada' | 'indisponivel' | 'nao_aplicavel';
  mensagem: string;
  dados: CamposFiscais;
}
export interface ContextoComparacao {
  referenciaHash: string | null;
  numero: string | null;
  competencia: string;
  ambiente: 'producao' | 'homologacao';
  referencia: CamposFiscais;
  preparado: CamposFiscais;
  politicaConfirmada: boolean;
  pendencias: string[];
}
export interface EvidenciasExternas {
  cadastral: ConsultaExterna;
  convenio: ConsultaExterna;
  aliquota: ConsultaExterna;
}
