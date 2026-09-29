/**
 * Cliente da API oficial de Distribuicao de DF-e do ADN da NFS-e Nacional.
 * A autenticacao ocorre por mTLS com o certificado A1 do contribuinte.
 */

import https from 'node:https';
import zlib from 'node:zlib';

export type DocumentoAdn = {
  nsu: number;
  chaveAcesso?: string;
  dataHoraGeracao?: string;
  xml: string;
};

export type ResultadoConsultaAdn = {
  documento: DocumentoAdn;
  maxNsu: number;
};

type RespostaHttp = { status: number; corpo: string };

export type HttpMtlsAdn = (
  url: string,
  pfx: Buffer,
  passphrase: string
) => Promise<RespostaHttp>;

type LoteAdn = {
  documentos: DocumentoAdn[];
  maxNsu: number;
};

export class AdnNfseClient {
  constructor(
    private readonly transmissorHttp?: HttpMtlsAdn,
    private readonly baseUrl = 'https://adn.nfse.gov.br/contribuintes'
  ) {}

  async buscarNfseMaisRecente(
    pfxBuffer: Buffer,
    senhaCertificado: string,
    documentoTitular: string
  ): Promise<ResultadoConsultaAdn> {
    const titular = documentoTitular.replace(/\D/g, '');
    const loteInicial = await this.consultarLote(0, pfxBuffer, senhaCertificado, titular);
    let documentos = loteInicial.documentos;

    const maiorNsuRecebido = documentos.reduce((maior, item) => Math.max(maior, item.nsu), 0);
    if (loteInicial.maxNsu > maiorNsuRecebido) {
      // A API entrega no maximo 50 DF-e. Consultar perto do maxNSU evita
      // percorrer todo o historico apenas para obter a nota mais recente.
      const inicioUltimoLote = Math.max(0, loteInicial.maxNsu - 50);
      const loteFinal = await this.consultarLote(inicioUltimoLote, pfxBuffer, senhaCertificado, titular);
      documentos = [...documentos, ...loteFinal.documentos];
    }

    const notasLocalizadas = documentos
      .filter((item) => /<(?:\w+:)?NFSe\b/i.test(item.xml));
    const notas = notasLocalizadas
      .filter((item) => this.extrairDocumentoPrestador(item.xml) === titular)
      .sort((a, b) => {
        const dataA = a.dataHoraGeracao ? Date.parse(a.dataHoraGeracao) : 0;
        const dataB = b.dataHoraGeracao ? Date.parse(b.dataHoraGeracao) : 0;
        return dataB - dataA || b.nsu - a.nsu;
      });

    if (notas.length === 0) {
      if (documentos.length === 0) {
        throw new Error('O ADN não retornou documentos fiscais para o titular deste certificado.');
      }
      if (notasLocalizadas.length === 0) {
        throw new Error(`O ADN retornou ${documentos.length} documento(s), mas nenhum deles é uma NFS-e.`);
      }
      throw new Error(`O ADN retornou ${notasLocalizadas.length} NFS-e(s), mas nenhuma foi emitida pelo titular deste certificado.`);
    }

    return { documento: notas[0], maxNsu: loteInicial.maxNsu };
  }

  private extrairDocumentoPrestador(xml: string): string | null {
    const grupos = ['prest', 'emit'];
    for (const grupo of grupos) {
      const regexGrupo = new RegExp(
        `<(?:\\w+:)?${grupo}\\b[\\s\\S]*?<(?:\\w+:)?(?:CNPJ|CPF)>(\\d{11,14})<\\/(?:\\w+:)?(?:CNPJ|CPF)>[\\s\\S]*?<\\/(?:\\w+:)?${grupo}>`,
        'i'
      );
      const match = xml.match(regexGrupo);
      if (match) return match[1];
    }
    return null;
  }

  private async consultarLote(
    ultimoNsu: number,
    pfxBuffer: Buffer,
    senhaCertificado: string,
    documentoTitular: string
  ): Promise<LoteAdn> {
    const parametros = new URLSearchParams({ lote: 'true' });
    if (documentoTitular.length === 14) {
      parametros.set('cnpjConsulta', documentoTitular);
    }
    const url = `${this.baseUrl.replace(/\/$/, '')}/DFe/${ultimoNsu}?${parametros.toString()}`;
    const resposta = this.transmissorHttp
      ? await this.transmissorHttp(url, pfxBuffer, senhaCertificado)
      : await this.executarRequisicaoMtls(url, pfxBuffer, senhaCertificado);

    if (resposta.status === 429) {
      throw new Error('O ADN limitou temporariamente as consultas. Tente novamente em alguns minutos.');
    }

    let json: Record<string, any>;
    try {
      json = JSON.parse(resposta.corpo);
    } catch {
      throw new Error(`O ADN retornou uma resposta invalida (HTTP ${resposta.status}).`);
    }

    if (resposta.status >= 400) {
      const detalhe = this.extrairErro(json);
      throw new Error(`Consulta ao ADN recusada (HTTP ${resposta.status}): ${detalhe}`);
    }

    const statusProcessamento = String(
      json.StatusProcessamento ?? json.statusProcessamento ?? json.status ?? ''
    ).toUpperCase();
    if (statusProcessamento.includes('REJEICAO') || statusProcessamento.includes('REJEIÇÃO')) {
      throw new Error(`Consulta ao ADN rejeitada: ${this.extrairErro(json)}`);
    }

    const loteRaw = json.LoteDFe ?? json.loteDFe ?? json.documentos ?? [];
    const itens = Array.isArray(loteRaw) ? loteRaw : loteRaw ? [loteRaw] : [];
    const documentos = itens
      .map((item: Record<string, any>) => this.normalizarDocumento(item))
      .filter((item: DocumentoAdn | null): item is DocumentoAdn => item !== null);

    const maxNsu = Number(
      json.MaxNSU ?? json.maxNSU ?? json.MaxNsu ?? json.maxNsu ??
      documentos.reduce((maior, item) => Math.max(maior, item.nsu), ultimoNsu)
    );

    return { documentos, maxNsu: Number.isFinite(maxNsu) ? maxNsu : ultimoNsu };
  }

  private normalizarDocumento(item: Record<string, any>): DocumentoAdn | null {
    const arquivo = item.ArquivoXml ?? item.arquivoXml ?? item.XML ?? item.xml;
    if (typeof arquivo !== 'string' || !arquivo.trim()) return null;

    const xml = this.decodificarXml(arquivo);
    if (!xml) return null;

    return {
      nsu: Number(item.NSU ?? item.nsu ?? 0),
      chaveAcesso: item.ChaveAcesso ?? item.chaveAcesso,
      dataHoraGeracao: item.DataHoraGeracao ?? item.dataHoraGeracao,
      xml
    };
  }

  private decodificarXml(valor: string): string | null {
    const limpo = valor.trim();
    if (limpo.startsWith('<')) return limpo;

    try {
      const buffer = Buffer.from(limpo, 'base64');
      const conteudo = buffer[0] === 0x1f && buffer[1] === 0x8b
        ? zlib.gunzipSync(buffer).toString('utf-8')
        : buffer.toString('utf-8');
      return conteudo.trim().startsWith('<') ? conteudo.trim() : null;
    } catch {
      return null;
    }
  }

  private extrairErro(json: Record<string, any>): string {
    const erros = json.Erros ?? json.erros ?? json.Mensagens ?? json.mensagens;
    if (Array.isArray(erros) && erros.length > 0) {
      const erro = erros[0];
      return String(erro.Descricao ?? erro.descricao ?? erro.Mensagem ?? erro.mensagem ?? erro);
    }
    return String(json.motivo ?? json.message ?? json.detalhe ?? 'motivo nao informado');
  }

  private executarRequisicaoMtls(
    urlStr: string,
    pfx: Buffer,
    passphrase: string
  ): Promise<RespostaHttp> {
    return new Promise((resolve, reject) => {
      const url = new URL(urlStr);
      const req = https.request({
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname + url.search,
        method: 'GET',
        headers: { Accept: 'application/json' },
        pfx,
        passphrase,
        timeout: 45000,
        rejectUnauthorized: true
      }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({
          status: res.statusCode || 0,
          corpo: Buffer.concat(chunks).toString('utf-8')
        }));
      });

      req.on('timeout', () => req.destroy(new Error('Timeout de 45s ao consultar o ADN da NFS-e.')));
      req.on('error', reject);
      req.end();
    });
  }
}
