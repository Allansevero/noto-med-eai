/**
 * Porta para envio de documento PDF (DANFSe) na conversa do paciente via Evolution API.
 * Acionada estritamente após a autorização bem-sucedida da nota pela SEFIN (seção 3.2, item 6).
 */

export interface EnviarPdfDanfseParams {
  instanciaNome: string;
  contatoTelefone: string;
  pdfPathOuUrl: string;
  nomeArquivo: string;
  legenda?: string;
}

export interface ResultadoEnvioPdf {
  sucesso: boolean;
  mensagemId?: string;
  erro?: string;
}

export interface EnviarPdfDanfse {
  enviarPdf(params: EnviarPdfDanfseParams): Promise<ResultadoEnvioPdf>;
}
