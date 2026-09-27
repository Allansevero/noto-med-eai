/**
 * Primitivas gráficas e renderização visual do DANFSe v2.0 Padrão Nacional.
 * Reproduz rigorosamente a geometria vetorial, proporções e tipografia do modelo oficial
 * emitido pelo Portal Nacional da NFS-e (Receita Federal do Brasil / SEFIN).
 */

import { rgb, degrees, type PDFPage, type PDFFont, type Color } from 'pdf-lib';

export interface ContextoRenderizacaoDanfse {
  page: PDFPage;
  fontRegular: PDFFont;
  fontBold: PDFFont;
  width: number;
  height: number;
  marginX: number;
  contentWidth: number;
  currentY: number;
}

export const CORES_DANFSE = {
  black: rgb(0, 0, 0),
  grayDark: rgb(0.2, 0.2, 0.2),
  grayText: rgb(0.28, 0.28, 0.28),
  border: rgb(0.15, 0.15, 0.15),
  sectionHeaderBg: rgb(0.92, 0.92, 0.92),
  fieldBg: rgb(0.98, 0.98, 0.98),
  nfseVerde: rgb(0.0, 0.52, 0.32),
  nfseAzul: rgb(0.0, 0.62, 0.65),
  redHomologacao: rgb(0.85, 0.1, 0.1),
  branco: rgb(1, 1, 1)
};

export function desenharCaixa(
  ctx: ContextoRenderizacaoDanfse,
  x: number,
  y: number,
  w: number,
  h: number,
  bg?: Color
): void {
  ctx.page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    borderWidth: 0.5,
    borderColor: CORES_DANFSE.border,
    color: bg
  });
}

export function desenharCelula(
  ctx: ContextoRenderizacaoDanfse,
  x: number,
  yTop: number,
  w: number,
  h: number,
  label: string,
  value: string,
  isBold = false,
  bg?: Color
): void {
  desenharCaixa(ctx, x, yTop - h, w, h, bg);
  if (label) {
    ctx.page.drawText(label, {
      x: x + 2.5,
      y: yTop - 6.5,
      size: 5.2,
      font: ctx.fontBold,
      color: CORES_DANFSE.grayText
    });
  }
  const valY = label ? yTop - 13.5 : yTop - h / 2 - 2.5;
  const valStr = value || '-';
  const maxChars = Math.floor(w / 4.2);
  const displayVal = valStr.length > maxChars ? `${valStr.slice(0, Math.max(2, maxChars - 2))}..` : valStr;
  ctx.page.drawText(displayVal, {
    x: x + 2.5,
    y: valY,
    size: isBold ? 7 : 6.5,
    font: isBold ? ctx.fontBold : ctx.fontRegular,
    color: CORES_DANFSE.black
  });
}

/**
 * Desenha a logomarca vetorial idêntica da NFS-e Nacional:
 * "NF" em verde bandeira, "Se" em turquesa/azul, e os textos oficiais de acompanhamento.
 */
export function desenharLogoNfseNacional(
  ctx: ContextoRenderizacaoDanfse,
  x: number,
  yTop: number
): void {
  // Letras NF em verde
  ctx.page.drawText('NF', {
    x,
    y: yTop - 25,
    size: 24,
    font: ctx.fontBold,
    color: CORES_DANFSE.nfseVerde
  });

  // Letras Se em turquesa/ciano
  ctx.page.drawText('se', {
    x: x + 34,
    y: yTop - 25,
    size: 24,
    font: ctx.fontBold,
    color: CORES_DANFSE.nfseAzul
  });

  // Textos laterais pequenos
  ctx.page.drawText('Nota Fiscal de', {
    x: x + 62,
    y: yTop - 17,
    size: 6.5,
    font: ctx.fontRegular,
    color: CORES_DANFSE.grayText
  });
  ctx.page.drawText('Serviço eletrônica', {
    x: x + 62,
    y: yTop - 25,
    size: 6.5,
    font: ctx.fontBold,
    color: CORES_DANFSE.nfseVerde
  });
}
