/**
 * Renderização das Bandas 1 e 2 do DANFSe v2.0 (Cabeçalho oficial, dados da nota e QR Code).
 * Formata a chave nacional de 50 dígitos em blocos de 4 e embute o QR Code vetorial.
 */

import type { PDFImage } from 'pdf-lib';
import type { DanfsePdfOptions } from './danfse-pdf-options.js';
import {
  type ContextoRenderizacaoDanfse,
  CORES_DANFSE,
  desenharCaixa,
  desenharCampo
} from './renderizar-secoes-danfse.js';

export function renderizarCabecalho(
  ctx: ContextoRenderizacaoDanfse,
  options: DanfsePdfOptions
): void {
  const h = 45;
  desenharCaixa(ctx, ctx.marginX, ctx.currentY - h, ctx.contentWidth, h);

  ctx.page.drawText('NFS-e', { x: ctx.marginX + 10, y: ctx.currentY - 26, size: 20, font: ctx.fontBold, color: CORES_DANFSE.black });
  ctx.page.drawText('NACIONAL', { x: ctx.marginX + 10, y: ctx.currentY - 37, size: 9, font: ctx.fontBold, color: CORES_DANFSE.grayText });
  ctx.page.drawText('DANFSe v2.0', { x: ctx.marginX + 135, y: ctx.currentY - 14, size: 11, font: ctx.fontBold, color: CORES_DANFSE.black });
  ctx.page.drawText('Documento Auxiliar da Nota Fiscal de Serviço Eletrônica', { x: ctx.marginX + 135, y: ctx.currentY - 26, size: 8.5, font: ctx.fontRegular, color: CORES_DANFSE.black });
  ctx.page.drawText('Padrão Nacional da NFS-e (Receita Federal do Brasil / SEFIN)', { x: ctx.marginX + 135, y: ctx.currentY - 37, size: 7, font: ctx.fontRegular, color: CORES_DANFSE.grayText });

  const dirW = 140;
  const dirX = ctx.width - ctx.marginX - dirW;
  const munUf = `MUNICÍPIO: ${(options.prestador?.municipio || 'PORTO ALEGRE').toUpperCase()} - ${(options.prestador?.uf || 'RS').toUpperCase()}`;
  ctx.page.drawText(munUf, { x: dirX, y: ctx.currentY - 13, size: 7, font: ctx.fontBold, color: CORES_DANFSE.black });
  ctx.page.drawText('Ambiente Gerador: SEFIN Nacional', { x: dirX, y: ctx.currentY - 24, size: 6.5, font: ctx.fontRegular, color: CORES_DANFSE.grayText });

  const ehHomolog = options.ambiente === 'homologacao';
  ctx.page.drawText(`Tipo de Ambiente: ${ehHomolog ? 'Homologação' : 'Produção'}`, {
    x: dirX,
    y: ctx.currentY - 34,
    size: 6.5,
    font: ctx.fontBold,
    color: ehHomolog ? CORES_DANFSE.redHomologacao : CORES_DANFSE.greenProducao
  });

  ctx.currentY -= h;
}

export function renderizarDadosNotaEQrCode(
  ctx: ContextoRenderizacaoDanfse,
  options: DanfsePdfOptions,
  qrImg?: PDFImage
): void {
  const dadosNfseH = 82;
  const qrColW = 95;
  const dadosColW = ctx.contentWidth - qrColW;
  desenharCaixa(ctx, ctx.marginX, ctx.currentY - dadosNfseH, ctx.contentWidth, dadosNfseH);

  const chaveLimpa = (options.chaveAcesso || '').replace(/\D/g, '');
  const chaveFmt = chaveLimpa.replace(/(\d{4})/g, '$1 ').trim();
  ctx.page.drawText('CHAVE DE ACESSO DA NFS-e', { x: ctx.marginX + 4, y: ctx.currentY - 9, size: 6, font: ctx.fontBold, color: CORES_DANFSE.grayText });
  ctx.page.drawText(chaveFmt, { x: ctx.marginX + 4, y: ctx.currentY - 20, size: 8.5, font: ctx.fontBold, color: CORES_DANFSE.black });

  renderizarGradeDadosNota(ctx, dadosColW, options);
  renderizarQuadroQrCode(ctx, dadosColW, qrColW, dadosNfseH, qrImg);

  ctx.currentY -= dadosNfseH;
}

function renderizarGradeDadosNota(ctx: ContextoRenderizacaoDanfse, dadosColW: number, options: DanfsePdfOptions): void {
  const cW3 = dadosColW / 3;
  const rowH = 19;
  let rY = ctx.currentY - 25;

  const dataEmissao = options.dataEmissao || new Date().toISOString();
  drawLinha1Grade(ctx, cW3, rY, rowH, options, dataEmissao);
  rY -= rowH;
  drawLinha2Grade(ctx, cW3, rY, rowH, options, dataEmissao);
  rY -= rowH;
  drawLinha3Grade(ctx, cW3, rY, rowH, options);
}

function drawLinha1Grade(ctx: ContextoRenderizacaoDanfse, cW3: number, rY: number, rowH: number, opt: DanfsePdfOptions, dt: string): void {
  desenharCampo(ctx, ctx.marginX, rY, cW3, rowH, 'Número da NFS-e', opt.numero || '1', true, CORES_DANFSE.fieldBg);
  desenharCampo(ctx, ctx.marginX + cW3, rY, cW3, rowH, 'Competência', opt.competencia || dt.slice(0, 10));
  desenharCampo(ctx, ctx.marginX + cW3 * 2, rY, cW3, rowH, 'Data/Hora Emissão NFS-e', dt.replace('T', ' ').slice(0, 19));
}

function drawLinha2Grade(ctx: ContextoRenderizacaoDanfse, cW3: number, rY: number, rowH: number, opt: DanfsePdfOptions, dt: string): void {
  desenharCampo(ctx, ctx.marginX, rY, cW3, rowH, 'Número da DPS', opt.numero || '1', false);
  desenharCampo(ctx, ctx.marginX + cW3, rY, cW3, rowH, 'Série da DPS', opt.serie || '1', false);
  desenharCampo(ctx, ctx.marginX + cW3 * 2, rY, cW3, rowH, 'Data/Hora Emissão DPS', dt.slice(0, 10));
}

function drawLinha3Grade(ctx: ContextoRenderizacaoDanfse, cW3: number, rY: number, rowH: number, opt: DanfsePdfOptions): void {
  desenharCampo(ctx, ctx.marginX, rY, cW3, rowH, 'Emitente da NFS-e', 'Prestador', false);
  desenharCampo(ctx, ctx.marginX + cW3, rY, cW3, rowH, 'Situação da NFS-e', opt.cancelada ? 'CANCELADA' : 'EMITIDA COM SUCESSO', true);
  desenharCampo(ctx, ctx.marginX + cW3 * 2, rY, cW3, rowH, 'Finalidade', 'Normal');
}

function renderizarQuadroQrCode(
  ctx: ContextoRenderizacaoDanfse,
  dadosColW: number,
  qrColW: number,
  dadosNfseH: number,
  qrImg?: PDFImage
): void {
  const qrBoxX = ctx.marginX + dadosColW;
  if (qrImg) {
    ctx.page.drawImage(qrImg, { x: qrBoxX + (qrColW - 58) / 2, y: ctx.currentY - 58 - 4, width: 58, height: 58 });
  }
  ctx.page.drawText('Consulte pela chave ou QR Code', { x: qrBoxX + 5, y: ctx.currentY - 68, size: 5, font: ctx.fontRegular, color: CORES_DANFSE.grayText });
  ctx.page.drawText('no Portal Nacional da NFS-e', { x: qrBoxX + 11, y: ctx.currentY - 76, size: 5, font: ctx.fontRegular, color: CORES_DANFSE.grayText });
}
