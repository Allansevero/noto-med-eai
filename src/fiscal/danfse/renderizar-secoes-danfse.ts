/**
 * Primitivas gráficas e renderização das seções visuais do DANFSe v2.0.
 * Concentra os cálculos geométricos em pontos (pt) do formato A4 e desenho vetorial,
 * incluindo o Brasão oficial vetorial da República Federativa do Brasil e design system SEFIN.
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
  grayText: rgb(0.35, 0.35, 0.35),
  border: rgb(0.2, 0.2, 0.2),
  sectionHeaderBg: rgb(0.88, 0.88, 0.88),
  fieldBg: rgb(0.96, 0.96, 0.96),
  greenBadgeBg: rgb(0.9, 0.96, 0.9),
  greenBadgeText: rgb(0.08, 0.42, 0.12),
  redHomologacao: rgb(0.85, 0.1, 0.1),
  greenProducao: rgb(0.08, 0.5, 0.12),
  brasilAzul: rgb(0.04, 0.2, 0.45),
  brasilVerde: rgb(0.05, 0.45, 0.18),
  brasilOuro: rgb(0.86, 0.72, 0.12),
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
  const maxChars = Math.floor(w / 4.7);
  const displayVal = valStr.length > maxChars ? `${valStr.slice(0, Math.max(2, maxChars - 2))}..` : valStr;
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

/**
 * Desenha o Brasão Heráldico das Armas Nacionais da República Federativa do Brasil em vetor puro.
 * Constrói a estrela pentagonal dourada/verde, o disco azul central e as estrelas do Cruzeiro do Sul.
 */
export function desenharBrasaoRepublica(
  ctx: ContextoRenderizacaoDanfse,
  cx: number,
  cy: number,
  raio = 16
): void {
  // 1. Coroa de louros externa verde
  ctx.page.drawCircle({
    x: cx,
    y: cy,
    size: raio,
    borderWidth: 1.5,
    borderColor: CORES_DANFSE.brasilVerde,
    color: rgb(0.94, 0.98, 0.94)
  });

  // 2. Aro dourado interno
  ctx.page.drawCircle({
    x: cx,
    y: cy,
    size: raio * 0.75,
    borderWidth: 1.0,
    borderColor: CORES_DANFSE.brasilOuro
  });

  // 3. Disco azul central (Globo celeste da República)
  ctx.page.drawCircle({
    x: cx,
    y: cy,
    size: raio * 0.55,
    color: CORES_DANFSE.brasilAzul
  });

  // 4. Estrelas do Cruzeiro do Sul (pontos brancos)
  const starSize = 0.9;
  ctx.page.drawCircle({ x: cx, y: cy + raio * 0.25, size: starSize, color: CORES_DANFSE.branco }); // Topo
  ctx.page.drawCircle({ x: cx, y: cy - raio * 0.25, size: starSize, color: CORES_DANFSE.branco }); // Base
  ctx.page.drawCircle({ x: cx - raio * 0.22, y: cy + raio * 0.05, size: starSize, color: CORES_DANFSE.branco }); // Esquerda
  ctx.page.drawCircle({ x: cx + raio * 0.22, y: cy + raio * 0.05, size: starSize, color: CORES_DANFSE.branco }); // Direita
  ctx.page.drawCircle({ x: cx + raio * 0.09, y: cy - raio * 0.07, size: starSize * 0.7, color: CORES_DANFSE.branco }); // Intrometida
}
