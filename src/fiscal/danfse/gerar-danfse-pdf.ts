/**
 * Gerador oficial do DANFSe v2.0 (Documento Auxiliar da NFS-e Padrão Nacional) em PDF.
 * Implementa integralmente as diretrizes do modelo-de-pdf.md (NT-008 e RTC 2026),
 * utilizando pdf-lib vetorial e qrcode sem navegadores ou dependências pesadas.
 */

import { PDFDocument, StandardFonts, type PDFImage } from 'pdf-lib';
import QRCode from 'qrcode';
import type { DanfsePdfOptions } from './danfse-pdf-options.js';
import type { ContextoRenderizacaoDanfse } from './renderizar-secoes-danfse.js';
import { renderizarCabecalho, renderizarDadosNotaEQrCode } from './renderizar-cabecalho-e-nota.js';
import { renderizarPrestador, renderizarTomador } from './renderizar-participantes.js';
import {
  renderizarServico,
  renderizarTributacaoMunicipal,
  renderizarTotaisEValorLiquido,
  renderizarInformacoesComplementares,
  renderizarMarcaDagua
} from './renderizar-servicos-e-totais.js';

export async function generateDanfsePdf(options: DanfsePdfOptions = {}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const marginX = 20;
  const contentWidth = width - marginX * 2;
  const ctx: ContextoRenderizacaoDanfse = {
    page,
    fontRegular,
    fontBold,
    width,
    height,
    marginX,
    contentWidth,
    currentY: height - 20
  };

  const qrImg = await gerarImagemQrCode(pdfDoc, options.chaveAcesso);

  renderizarCabecalho(ctx, options);
  renderizarDadosNotaEQrCode(ctx, options, qrImg);
  renderizarPrestador(ctx, options.prestador);
  renderizarTomador(ctx, options.tomador);
  renderizarServico(ctx, options.servico, options.prestador);
  renderizarTributacaoMunicipal(ctx, options.servico, options.prestador);
  renderizarTotaisEValorLiquido(ctx, options.servico);
  renderizarInformacoesComplementares(ctx, options.prestador);
  renderizarMarcaDagua(ctx, options);

  return pdfDoc.save();
}

export const gerarDanfsePdf = generateDanfsePdf;

async function gerarImagemQrCode(pdfDoc: PDFDocument, chaveAcesso?: string): Promise<PDFImage | undefined> {
  const chaveLimpa = (chaveAcesso || '').replace(/\D/g, '');
  const qrUrl = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chaveLimpa}`;

  try {
    const qrBuffer = await QRCode.toBuffer(qrUrl, {
      margin: 1,
      width: 140,
      errorCorrectionLevel: 'M'
    });
    return await pdfDoc.embedPng(qrBuffer);
  } catch {
    return undefined;
  }
}
