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
    const resultadoBotao = await this.enviarOtpComBotao(params.telefone, params.codigo, texto);
    if (resultadoBotao.sucesso) {
      return resultadoBotao;
    }

    console.warn(`[Evolution] OTP interativo indisponível: ${resultadoBotao.erro}`);
    return this.enviarTextoGenerico(this.instanciaOficialNome, params.telefone, texto);
  }

  async enviarTexto(params: EnviarMensagemPacienteParams): Promise<ResultadoEnvioMensagemPaciente> {
    return this.enviarTextoGenerico(params.instanciaNome, params.contatoTelefone, params.texto);
  }

  async enviarPdf(params: EnviarPdfDanfseParams): Promise<ResultadoEnvioPdf> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/message/sendMedia/${params.instanciaNome}`;
    try {
      const telLimpo = params.contatoTelefone.replace(/\D/g, '');
      const telNormalizado =
        telLimpo.length === 10 || telLimpo.length === 11 ? `55${telLimpo}` : telLimpo;

      let mediaPayload = params.pdfPathOuUrl;
      if (mediaPayload.startsWith('data:')) {
        const idx = mediaPayload.indexOf('base64,');
        if (idx !== -1) {
          mediaPayload = mediaPayload.slice(idx + 7);
        }
      }

      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.apiKey
        },
        body: JSON.stringify({
          number: telNormalizado,
          mediatype: 'document',
          mimetype: 'application/pdf',
          media: mediaPayload,
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

  private async enviarOtpComBotao(
    telefone: string,
    codigo: string,
    textoFallback: string
  ): Promise<ResultadoEnvioOtp> {
    const url = `${this.baseUrl.replace(/\/$/, '')}/message/sendButtons/${this.instanciaOficialNome}`;
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.apiKey
        },
        body: JSON.stringify({
          number: this.normalizarTelefone(telefone),
          // Enviar vazio evita que versões da Evolution exibam campos ausentes como "undefined".
          title: '',
          description: textoFallback,
          footer: '',
          buttons: [{
            type: 'copy',
            displayText: 'Copiar código',
            copyCode: codigo
          }]
        })
      });

      if (!resp.ok) {
        const txt = await resp.text();
        return { sucesso: false, erro: `HTTP ${resp.status}: ${txt}` };
      }
      return { sucesso: true };
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
          number: this.normalizarTelefone(telefone),
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

  private normalizarTelefone(telefone: string): string {
    const telLimpo = telefone.replace(/\D/g, '');
    return telLimpo.length === 10 || telLimpo.length === 11 ? `55${telLimpo}` : telLimpo;
  }
}
