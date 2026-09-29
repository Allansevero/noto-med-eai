/**
 * Cliente HTTP para a API de Consulta Cadastral de CPF do Hub do Desenvolvedor
 * (https://hubdodesenvolvedor.com.br). Implementa a porta ConsultaCpfProvider
 * para enriquecer dados cadastrais do paciente (nome completo e nascimento)
 * mantendo o isolamento de I/O em relação às regras de negócio.
 */

import type { ConsultaCpfProvider, DadosConsultaCpf } from '../../paciente/consulta-cpf-provider.js';

export interface HubDesenvolvedorCpfClientOptions {
  baseUrl?: string;
  timeoutMs?: number;
}

export class HubDesenvolvedorCpfClient implements ConsultaCpfProvider {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly token: string,
    options?: HubDesenvolvedorCpfClientOptions
  ) {
    this.baseUrl = (options?.baseUrl || 'https://ws.hubdodesenvolvedor.com.br').replace(/\/$/, '');
    this.timeoutMs = options?.timeoutMs ?? 8000;
  }

  async consultar(cpf: string): Promise<DadosConsultaCpf | null> {
    const cpfLimpo = cpf.replace(/\D/g, '');
    if (cpfLimpo.length !== 11 || !this.token) {
      return null;
    }

    try {
      const url = `${this.baseUrl}/v2/cpf/?cpf=${cpfLimpo}&token=${encodeURIComponent(this.token)}`;
      const resposta = await fetch(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json'
        },
        signal: AbortSignal.timeout(this.timeoutMs)
      });

      if (!resposta.ok) {
        return null;
      }

      const corpo: any = await resposta.json();
      return this.extrairDados(corpo);
    } catch (err: any) {
      console.warn(`[HubDesenvolvedor] Falha ao consultar CPF ${cpfLimpo}:`, err?.message || err);
      return null;
    }
  }

  private extrairDados(corpo: any): DadosConsultaCpf | null {
    if (!corpo || corpo.status !== true || !corpo.result) {
      if (corpo?.message) {
        console.warn(`[HubDesenvolvedor] Resposta da API: ${corpo.message}`);
      }
      return null;
    }

    const nome = typeof corpo.result.nome_da_pf === 'string' ? corpo.result.nome_da_pf.trim() : '';
    if (!nome) {
      return null;
    }

    const dataNascimento = this.parseDataNascimento(corpo.result.data_nascimento);
    return {
      nome,
      dataNascimento,
      situacaoCadastral: corpo.result.situacao_cadastral || null
    };
  }

  private parseDataNascimento(dataStr?: unknown): Date | null {
    if (typeof dataStr !== 'string' || !dataStr.trim()) {
      return null;
    }

    const limpo = dataStr.replace(/\\/g, '').trim();
    const partes = limpo.split('/');
    if (partes.length !== 3) {
      return null;
    }

    const dia = Number.parseInt(partes[0], 10);
    const mes = Number.parseInt(partes[1], 10);
    const ano = Number.parseInt(partes[2], 10);

    if (Number.isNaN(dia) || Number.isNaN(mes) || Number.isNaN(ano)) {
      return null;
    }

    if (dia < 1 || dia > 31 || mes < 1 || mes > 12 || ano < 1900 || ano > 2100) {
      return null;
    }

    return new Date(Date.UTC(ano, mes - 1, dia));
  }
}
