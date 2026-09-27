/**
 * Primitivas gráficas e renderização das seções visuais do DANFSe v2.0.
 * Concentra os cálculos geométricos em pontos (pt) do formato A4 e desenho vetorial,
 * mantendo o gerador principal enxuto e estritamente aderente ao modelo-de-pdf.md.
 */

import { rgb, degrees, type PDFPage, type PDFFont, type Color, type PDFImage } from 'pdf-lib';
import type { DanfsePdfOptions } from './danfse-pdf-options.js';

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
  grayText: rgb(0.35, 0.35, 0.35),
  border: rgb(0.2, 0.2, 0.2),
  sectionHeaderBg: rgb(0.88, 0.88, 0.88),
  fieldBg: rgb(0.96, 0.96, 0.96),
  greenBadgeBg: rgb(0.9, 0.95, 0.9),
  greenBadgeText: rgb(0.1, 0.4, 0.1),
  redHomologacao: rgb(0.85, 0.1, 0.1),
  greenProducao: rgb(0.1, 0.5, 0.1)
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

export function desenharCampo(
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
    ctx.page.drawText(label.toUpperCase(), {
      x: x + 2.5,
      y: yTop - 7.5,
      size: 5.5,
      font: ctx.fontBold,
      color: CORES_DANFSE.grayText
    });
  }
  const valY = label ? yTop - 16.5 : yTop - h / 2 - 3;
  const valStr = value || '-';
  const maxChars = Math.floor(w / 4.8);
  const displayVal = valStr.length > maxChars ? `${valStr.slice(0, maxChars - 2)}..` : valStr;
  ctx.page.drawText(displayVal, {
    x: x + 2.5,
    y: valY,
    size: isBold ? 7.5 : 7,
    font: isBold ? ctx.fontBold : ctx.fontRegular,
    color: CORES_DANFSE.black
  });
}

export function desenharTituloSecao(
  ctx: ContextoRenderizacaoDanfse,
  titulo: string,
  h = 12
): void {
  desenharCaixa(ctx, ctx.marginX, ctx.currentY - h, ctx.contentWidth, h, CORES_DANFSE.sectionHeaderBg);
  ctx.page.drawText(titulo.toUpperCase(), {
    x: ctx.marginX + 4,
    y: ctx.currentY - 8.5,
    size: 6.5,
    font: ctx.fontBold,
    color: CORES_DANFSE.black
  });
  ctx.currentY -= h;
}
