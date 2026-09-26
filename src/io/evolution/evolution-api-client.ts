/**
 * Cliente HTTP para a Evolution API na VPS Hostinger (Easypanel).
 * Implementa envio de mensagens de texto e envio de DANFSe (PDF) via WhatsApp
 * para as portas `EnviarOtpWhatsapp`, `EnviarMensagemPaciente` e `EnviarPdfDanfse`.
 */

import type {
  EnviarOtpWhatsapp,
  EnviarOtpParams,
  ResultadoEnvioOtp
} from '../../otp/enviar-otp-whatsapp.js';
import { formatarMensagemOtp } from '../../otp/enviar-otp-whatsapp.js';
import type {
  EnviarMensagemPaciente,
  EnviarMensagemPacienteParams,
  ResultadoEnvioMensagemPaciente
} from '../../whatsapp/enviar-mensagem-paciente.js';
import type {
  EnviarPdfDanfse,
  EnviarPdfDanfseParams,
  ResultadoEnvioPdf
} from '../../whatsapp/enviar-pdf-danfse.js';

export class EvolutionApiClient
  implements EnviarOtpWhatsapp, EnviarMensagemPaciente, EnviarPdfDanfse
{
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly instanciaOficialNome: string
  ) {}

  async enviar(params: EnviarOtpParams): Promise<ResultadoEnvioOtp> {
    const texto = formatarMensagemOtp(params.codigo);
    const res = await this.enviarTextoGenerico(this.instanciaOficialNome, params.telefone, texto);
    return { sucesso: res.sucesso, erro: res.erro };
  }

  async enviarTexto(params: EnviarMensagemPacienteParams): Promise<ResultadoEnvioMensagemPaciente> {
    return this.enviarTextoGenerico(params.instanciaNome, params.contatoTelefone, params.texto);
  }

  async enviarPdf(params: EnviarPdfDanfseParams): Promise<ResultadoEnvioPdf> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/message/sendMedia/${params.instanciaNome}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.apiKey
        },
        body: JSON.stringify({
          number: params.contatoTelefone,
          mediatype: 'document',
          mimetype: 'application/pdf',
          media: params.pdfPathOuUrl,
          fileName: params.nomeArquivo,
          caption: params.legenda || 'Segue sua Nota Fiscal de Serviços (NFS-e).'
        })
      });

      if (!resp.ok) {
        const txt = await resp.text();
        return { sucesso: false, erro: `HTTP ${resp.status}: ${txt}` };
      }

      const json: any = await resp.json();
      return { sucesso: true, mensagemId: json?.key?.id };
    } catch (err: any) {
      return { sucesso: false, erro: err.message || 'Erro de conexão com Evolution API' };
    }
  }

  private async enviarTextoGenerico(
    instancia: string,
    telefone: string,
    texto: string
  ): Promise<ResultadoEnvioMensagemPaciente> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/message/sendText/${instancia}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.apiKey
        },
        body: JSON.stringify({
          number: telefone,
          text: texto
        })
      });

      if (!resp.ok) {
        const txt = await resp.text();
        return { sucesso: false, erro: `HTTP ${resp.status}: ${txt}` };
      }

      const json: any = await resp.json();
      return { sucesso: true, mensagemId: json?.key?.id };
    } catch (err: any) {
      return { sucesso: false, erro: err.message || 'Erro de conexão com Evolution API' };
    }
  }
}
