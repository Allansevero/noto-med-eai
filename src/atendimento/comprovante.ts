import { validarCpf } from '../paciente/validar-cpf.js';
import type { ConsultaEmAbertoRegistro } from './atendimento-repositorio.js';
import type { DadosMensagemEvolution } from '../whatsapp/payload-webhook-schema.js';

type CampoComprovante = 'valorCentavos' | 'dataPagamento' | 'nomePagador' | 'nomeFavorecido';
// Definido pelo dono: escala de 0 a 1, mínimo inclusivo para todos os campos obrigatórios.
export const CONFIANCA_MINIMA_COMPROVANTE = 0.90;

export interface CamposComprovante {
  valorCentavos?: number | null;
  dataPagamento?: string | null;
  nomePagador?: string | null;
  nomeFavorecido?: string | null;
  confianca?: Partial<Record<CampoComprovante, number>>;
}
export type ResultadoExtracaoComprovante =
  | { tipo: 'extraido'; campos: CamposComprovante }
  | { tipo: 'ilegivel' }
  | { tipo: 'nao_comprovante' };
export interface ExtratorComprovante {
  extrair(mensagem: DadosMensagemEvolution): Promise<ResultadoExtracaoComprovante>;
}
export interface EstadoPedidoComprovante {
  medicoId: string;
  paciente: { nome: string | null; cpf: string | null };
  ultimaConsulta: Pick<ConsultaEmAbertoRegistro, 'valorConsultaCentavos'> | null;
}
export type DecisaoPedidoComprovante =
  | { tipo: 'nenhuma'; motivo: 'COMPROVANTE_JA_PROCESSADO' | 'AUDITORIA_FALHOU' }
  | { tipo: 'perguntar_medico'; motivo: 'LEITURA_INDISPONIVEL' | 'COMPROVANTE_ILEGIVEL' | 'NAO_COMPROVANTE'
      | 'CAMPO_OBRIGATORIO_AUSENTE' | 'CONFIANCA_INSUFICIENTE' | 'CADASTRO_INCOMPLETO' | 'VALOR_DIVERGENTE' }
  | { tipo: 'perguntar_pacote'; motivo: 'VALOR_MULTIPLO_CONSULTA' }
  | { tipo: 'pedido_nota_pronto'; motivo: 'VALOR_IGUAL_ULTIMA_CONSULTA'; pedido: {
      medicoId: string; valorCentavos: number; dataPagamento: string;
      paciente: { nome: string; cpf: string }; observacao?: { pagador: string };
    } };
export interface AuditoriaComprovante {
  lido: ResultadoExtracaoComprovante | null;
  estado: EstadoPedidoComprovante;
  decisao: DecisaoPedidoComprovante;
}

export function decidirPedidoComprovante(
  lido: ResultadoExtracaoComprovante | null,
  estado: EstadoPedidoComprovante,
  processados: Array<ResultadoExtracaoComprovante | null>
): DecisaoPedidoComprovante {
  if (!lido) return { tipo: 'perguntar_medico', motivo: 'LEITURA_INDISPONIVEL' };
  if (lido.tipo === 'ilegivel') return { tipo: 'perguntar_medico', motivo: 'COMPROVANTE_ILEGIVEL' };
  if (lido.tipo === 'nao_comprovante') return { tipo: 'perguntar_medico', motivo: 'NAO_COMPROVANTE' };
  const { valorCentavos, dataPagamento, nomePagador, nomeFavorecido, confianca } = lido.campos;
  if (valorCentavos == null || !dataPagamento?.trim() || !nomePagador?.trim() || !nomeFavorecido?.trim()) {
    return { tipo: 'perguntar_medico', motivo: 'CAMPO_OBRIGATORIO_AUSENTE' };
  }
  if (processados.some(anterior => anterior?.tipo === 'extraido' && anterior.campos.valorCentavos === valorCentavos &&
      anterior.campos.dataPagamento === dataPagamento && anterior.campos.nomePagador === nomePagador)) {
    return { tipo: 'nenhuma', motivo: 'COMPROVANTE_JA_PROCESSADO' };
  }
  const campos: CampoComprovante[] = ['valorCentavos', 'dataPagamento', 'nomePagador', 'nomeFavorecido'];
  if (campos.some(campo => {
    const valor = confianca?.[campo];
    return typeof valor !== 'number' || !Number.isFinite(valor) || valor < CONFIANCA_MINIMA_COMPROVANTE || valor > 1;
  })) return { tipo: 'perguntar_medico', motivo: 'CONFIANCA_INSUFICIENTE' };
  const valorConsulta = estado.ultimaConsulta?.valorConsultaCentavos;
  if (!estado.paciente.nome?.trim() || !estado.paciente.cpf || !validarCpf(estado.paciente.cpf) ||
      !valorConsulta || !Number.isSafeInteger(valorConsulta) || valorConsulta < 0) {
    return { tipo: 'perguntar_medico', motivo: 'CADASTRO_INCOMPLETO' };
  }
  if (!Number.isSafeInteger(valorCentavos) || valorCentavos <= 0) return { tipo: 'perguntar_medico', motivo: 'VALOR_DIVERGENTE' };
  if (valorCentavos === valorConsulta) return { tipo: 'pedido_nota_pronto', motivo: 'VALOR_IGUAL_ULTIMA_CONSULTA', pedido: {
    medicoId: estado.medicoId, valorCentavos, dataPagamento,
    paciente: { nome: estado.paciente.nome, cpf: estado.paciente.cpf },
    ...(nomePagador === estado.paciente.nome ? {} : { observacao: { pagador: nomePagador } })
  } };
  if (valorCentavos >= valorConsulta * 2 && valorCentavos % valorConsulta === 0) {
    return { tipo: 'perguntar_pacote', motivo: 'VALOR_MULTIPLO_CONSULTA' };
  }
  return { tipo: 'perguntar_medico', motivo: 'VALOR_DIVERGENTE' };
}
