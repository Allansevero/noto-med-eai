/**
 * Validação de integridade fiscal antes da transmissão da NFS-e.
 * Garante que dados cadastrais (CRM/Nome) só autorizem a emissão se a
 * identidade e o vínculo da médica estiverem 100% confirmados no sistema.
 * Não faz I/O para poder ser testado isoladamente.
 */

export interface DadosValidacaoEmissao {
  identidadeMedicaConfirmada: boolean;
  statusCadastro: 'pendente' | 'em_analise' | 'confirmado';
  medica: {
    nome?: string;
    crm?: string;
    ufCrm?: string;
  };
  secretariaVinculada?: {
    id: string;
    ativa: boolean;
  };
}

export type MotivoRecusaFiscal =
  | 'identidade_pendente'
  | 'cadastro_incompleto'
  | 'dados_medica_ausentes'
  | 'vinculo_secretaria_invalido';

export type ResultadoProtecaoFiscal =
  | { podeTransmitir: true }
  | { podeTransmitir: false; motivo: MotivoRecusaFiscal; detalhe?: string };

export function validarProtecaoFiscal(dados: DadosValidacaoEmissao): ResultadoProtecaoFiscal {
  if (!dados.identidadeMedicaConfirmada) {
    return {
      podeTransmitir: false,
      motivo: 'identidade_pendente',
      detalhe: 'A identidade profissional da médica ainda não foi verificada.'
    };
  }

  if (dados.statusCadastro !== 'confirmado') {
    return {
      podeTransmitir: false,
      motivo: 'cadastro_incompleto',
      detalhe: 'O cadastro da médica está pendente de confirmação final.'
    };
  }

  if (!dados.medica.nome || !dados.medica.crm || !dados.medica.ufCrm) {
    return {
      podeTransmitir: false,
      motivo: 'dados_medica_ausentes',
      detalhe: 'Nome, CRM ou UF do CRM não foram informados.'
    };
  }

  if (dados.secretariaVinculada && !dados.secretariaVinculada.ativa) {
    return {
      podeTransmitir: false,
      motivo: 'vinculo_secretaria_invalido',
      detalhe: 'A secretária solicitante não possui vínculo ativo com a médica.'
    };
  }

  return { podeTransmitir: true };
}
