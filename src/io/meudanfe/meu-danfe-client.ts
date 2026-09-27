/**
 * Cliente HTTP para a API Meu Danfe v2 (https://api.meudanfe.com.br/v2).
 * Converte XML de NFS-e Padrão Nacional para o DANFSe oficial em PDF
 * via endpoint /fd/convert/xml-to-da, fornecendo conversão direta e fiel.
 */

export interface ResultadoConversaoMeuDanfe {
  sucesso: boolean;
  pdfBase64?: string;
  pdfBytes?: Buffer;
  nomeArquivo?: string;
  erro?: string;
}

export class MeuDanfeClient {
  private readonly baseUrl: string;

  constructor(
    private readonly apiKey: string,
    baseUrl = 'https://api.meudanfe.com.br/v2'
  ) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async converterXmlParaPdf(xmlString: string): Promise<ResultadoConversaoMeuDanfe> {
    if (!this.apiKey || this.apiKey.trim().length === 0) {
      return { sucesso: false, erro: 'Api-Key do Meu Danfe não informada' };
    }

    if (!xmlString || xmlString.trim().length === 0) {
      return { sucesso: false, erro: 'Conteúdo XML vazio para conversão' };
    }

    const url = `${this.baseUrl}/fd/convert/xml-to-da`;

    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/xml',
          'Api-Key': this.apiKey.trim()
        },
        body: xmlString
      });

      if (!resp.ok) {
        const txt = await resp.text();
        return { sucesso: false, erro: `HTTP ${resp.status}: ${txt}` };
      }

      const json: any = await resp.json();
      if (!json?.data) {
        return { sucesso: false, erro: 'Resposta do Meu Danfe sem o campo data com base64 do PDF' };
      }

      const pdfBase64 = json.data;
      const pdfBytes = Buffer.from(pdfBase64, 'base64');
      return {
        sucesso: true,
        pdfBase64,
        pdfBytes,
        nomeArquivo: json.name || 'DANFSe.pdf'
      };
    } catch (err: any) {
      return { sucesso: false, erro: err.message || 'Falha de conexão com a API Meu Danfe' };
    }
  }
}
