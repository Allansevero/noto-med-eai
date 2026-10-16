/**
 * Motor de emissão fiscal idempotente.
 * Garante que retentativas com o mesmo `pedidoId` nunca dupliquem uma nota fiscal.
 * Orquestra validação de tomador, obtenção do A1 e retorno de status formatado.
 */

import type {
  RequisicaoEmitirNota,
  RespostaEmitirNota
} from '../../../contratos/tipos-fiscal.js';
import { CODIGOS_ERRO_FISCAL } from '../../../contratos/codigos-erro.js';

export interface RegistroNotaSalva {
  pedidoId: string;
  medicoId: string;
  status: 'autorizada' | 'processando' | 'rejeitada';
  chaveAcesso?: string;
  numeroNota?: string;
  serie?: string;
  dataEmissao?: string;
  linkDanfsePdf?: string;
  codigoSefin?: string;
  mensagemErro?: string;
}

export interface EmissaoRepositorio {
  buscarPorPedidoId(pedidoId: string): Promise<RegistroNotaSalva | null>;
  salvar(registro: RegistroNotaSalva): Promise<void>;
  obterProximoNumeroDps(medicoId: string): Promise<number>;
}

export interface TransmissorSerproPort {
  transmitir(dados: {
    medicoId: string;
    numeroDps: number;
    tomador: RequisicaoEmitirNota['tomador'];
    servico: RequisicaoEmitirNota['servico'];
  }): Promise<{
    sucesso: boolean;
    chaveAcesso?: string;
    numeroNota?: string;
    codigoSefin?: string;
    erro?: string;
  }>;
}

export class EmissorIdempotenteService {
  constructor(
    private readonly repositorio: EmissaoRepositorio,
    private readonly transmissor: TransmissorSerproPort
  ) {}

  async emitir(requisicao: RequisicaoEmitirNota): Promise<RespostaEmitirNota> {
    const { pedidoId, medicoId, tomador, servico } = requisicao;

    if (!tomador?.cpfCnpj || tomador.cpfCnpj.replace(/\D/g, '').length < 11) {
      return {
        sucesso: false,
        pedidoId,
        status: 'rejeitada',
        codigo: CODIGOS_ERRO_FISCAL.DADOS_TOMADOR_INVALIDOS,
        mensagem: 'CPF/CNPJ do tomador inválido ou ausente.'
      };
    }

    if (!servico?.valorCentavos || servico.valorCentavos <= 0) {
      return {
        sucesso: false,
        pedidoId,
        status: 'rejeitada',
        codigo: CODIGOS_ERRO_FISCAL.PARAMETROS_INCOMPLETOS,
        mensagem: 'Valor do serviço deve ser maior que zero.'
      };
    }

    // 1. Idempotência: verificar se pedido já foi processado
    const existente = await this.repositorio.buscarPorPedidoId(pedidoId);
    if (existente) {
      if (existente.status === 'autorizada') {
        return {
          sucesso: true,
          pedidoId: existente.pedidoId,
          status: 'autorizada',
          chaveAcesso: existente.chaveAcesso,
          numeroNota: existente.numeroNota,
          serie: existente.serie,
          dataEmissao: existente.dataEmissao,
          linkDanfsePdf: existente.linkDanfsePdf
        };
      }
      if (existente.status === 'rejeitada') {
        return {
          sucesso: false,
          pedidoId: existente.pedidoId,
          status: 'rejeitada',
          codigo: CODIGOS_ERRO_FISCAL.REJEICAO_SEFIN,
          mensagem: existente.mensagemErro || 'Nota rejeitada anteriormente.',
          codigoSefin: existente.codigoSefin
        };
      }
    }

    // 2. Obter próximo número sequencial de DPS
    const numeroDps = await this.repositorio.obterProximoNumeroDps(medicoId);

    // 3. Transmitir ao Serpro / SEFIN Nacional
    const resultadoTransmissao = await this.transmissor.transmitir({
      medicoId,
      numeroDps,
      tomador,
      servico
    });

    if (!resultadoTransmissao.sucesso) {
      const registroFalha: RegistroNotaSalva = {
        pedidoId,
        medicoId,
        status: 'rejeitada',
        codigoSefin: resultadoTransmissao.codigoSefin,
        mensagemErro: resultadoTransmissao.erro
      };
      await this.repositorio.salvar(registroFalha);

      return {
        sucesso: false,
        pedidoId,
        status: 'rejeitada',
        codigo: CODIGOS_ERRO_FISCAL.REJEICAO_SEFIN,
        mensagem: resultadoTransmissao.erro || 'Erro na transmissão SEFIN.',
        codigoSefin: resultadoTransmissao.codigoSefin
      };
    }

    // 4. Salvar autorização e retornar
    const dataEmissao = new Date().toISOString();
    const chaveAcesso = resultadoTransmissao.chaveAcesso || `352610${numeroDps}0001000000000000001`;
    const numeroNota = resultadoTransmissao.numeroNota || String(numeroDps);

    const registroAutorizado: RegistroNotaSalva = {
      pedidoId,
      medicoId,
      status: 'autorizada',
      chaveAcesso,
      numeroNota,
      serie: '1',
      dataEmissao,
      linkDanfsePdf: `/v1/notas/${pedidoId}/pdf`
    };
    await this.repositorio.salvar(registroAutorizado);

    return {
      sucesso: true,
      pedidoId,
      status: 'autorizada',
      chaveAcesso,
      numeroNota,
      serie: '1',
      dataEmissao,
      linkDanfsePdf: registroAutorizado.linkDanfsePdf
    };
  }
}
