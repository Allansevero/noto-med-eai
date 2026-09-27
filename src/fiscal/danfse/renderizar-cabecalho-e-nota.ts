/**
 * Renderização do Cabeçalho Oficial e Dados da Nota Fiscal com QR Code (Bandas 1 e 2).
 * Inclui o Brasão Heráldico Nacional, títulos da Receita Federal/Ministério da Fazenda,
 * chave de acesso de 50 dígitos formatada em blocos de 4 e QR Code vetorial.
 */

import type { PDFImage } from 'pdf-lib';
import type { DanfsePdfOptions } from './danfse-pdf-options.js';
import {
  type ContextoRenderizacaoDanfse,
  CORES_DANFSE,
  desenharCaixa,
  desenharCampo,
  desenharBrasaoRepublica
} from './renderizar-secoes-danfse.js';
import {
  resolverNomeMunicipio,
  formatarChaveAcessoEmGruposDe4,
  comporChaveAcessoNacional
} from './formatadores-fiscais.js';

export function renderizarCabecalho(
  ctx: ContextoRenderizacaoDanfse,
  options: DanfsePdfOptions
): void {
  const h = 50;
  desenharCaixa(ctx, ctx.marginX, ctx.currentY - h, ctx.contentWidth, h);

  // 1. Brasão e Ministério da Fazenda / Receita Federal
  desenharBrasaoRepublica(ctx, ctx.marginX + 20, ctx.currentY - 25, 15);
  ctx.page.drawText('REPÚBLICA FEDERATIVA DO BRASIL', {
    x: ctx.marginX + 42,
    y: ctx.currentY - 17,
    size: 7,
    font: ctx.fontBold,
    color: CORES_DANFSE.black
  });
  ctx.page.drawText('MINISTÉRIO DA FAZENDA', {
    x: ctx.marginX + 42,
    y: ctx.currentY - 27,
    size: 6,
    font: ctx.fontBold,
    color: CORES_DANFSE.grayDark
  });
  ctx.page.drawText('SECRETARIA ESPECIAL DA RECEITA FEDERAL DO BRASIL', {
    x: ctx.marginX + 42,
    y: ctx.currentY - 37,
    size: 5,
    font: ctx.fontRegular,
    color: CORES_DANFSE.grayText
  });

  // 2. Identificação Central da NFS-e Nacional
  const centroX = ctx.marginX + 195;
  ctx.page.drawText('NFS-e - NOTA FISCAL DE SERVIÇO ELETRÔNICA', {
    x: centroX,
    y: ctx.currentY - 17,
    size: 9,
    font: ctx.fontBold,
    color: CORES_DANFSE.black
  });
  ctx.page.drawText('DANFSe v2.0 - Documento Auxiliar da NFS-e', {
    x: centroX,
    y: ctx.currentY - 28,
    size: 8,
    font: ctx.fontBold,
    color: CORES_DANFSE.grayDark
  });
  ctx.page.drawText('Padrão Nacional (Resolução CGSN nº 169/2022 e RTC 2026)', {
    x: centroX,
    y: ctx.currentY - 38,
    size: 6,
    font: ctx.fontRegular,
    color: CORES_DANFSE.grayText
  });

  // 3. Município e Ambiente SEFIN
  const dirW = 145;
  const dirX = ctx.width - ctx.marginX - dirW;
  const nomeMun = resolverNomeMunicipio(options.prestador?.municipio, options.prestador?.municipio);
  const uf = (options.prestador?.uf || 'RS').toUpperCase();
  ctx.page.drawText(`MUNICÍPIO: ${nomeMun} - ${uf}`, {
    x: dirX,
    y: ctx.currentY - 16,
    size: 7,
    font: ctx.fontBold,
    color: CORES_DANFSE.black
  });
  ctx.page.drawText('Ambiente Gerador: SEFIN Nacional', {
    x: dirX,
    y: ctx.currentY - 26,
    size: 6,
    font: ctx.fontRegular,
    color: CORES_DANFSE.grayText
  });

  const ehHomolog = options.ambiente === 'homologacao';
  ctx.page.drawText(`Ambiente: ${ehHomolog ? 'Homologação' : 'Produção'}`, {
    x: dirX,
    y: ctx.currentY - 36,
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

  // Obtém ou compõe chave de acesso de 50 dígitos
  const chave = obterChave50Digitos(options);
  const chaveFmt = formatarChaveAcessoEmGruposDe4(chave);

  ctx.page.drawText('CHAVE DE ACESSO DA NFS-e', {
    x: ctx.marginX + 4,
    y: ctx.currentY - 9,
    size: 6,
    font: ctx.fontBold,
    color: CORES_DANFSE.grayText
  });
  ctx.page.drawText(chaveFmt, {
    x: ctx.marginX + 4,
    y: ctx.currentY - 20,
    size: 8.5,
    font: ctx.fontBold,
    color: CORES_DANFSE.black
  });

  renderizarGradeDadosNota(ctx, dadosColW, options, chave);
  renderizarQuadroQrCode(ctx, dadosColW, qrColW, qrImg);

  ctx.currentY -= dadosNfseH;
}

function obterChave50Digitos(options: DanfsePdfOptions): string {
  const digitos = (options.chaveAcesso || '').replace(/\D/g, '');
  if (digitos.length === 50) return digitos;

  return comporChaveAcessoNacional({
    codIbgeMunicipio: options.prestador?.municipio || '4314902',
    ambiente: options.ambiente || 'producao',
    anoMes: options.competencia || new Date().toISOString().slice(0, 7),
    cnpjOuCpf: options.prestador?.cnpj || '33841732000190',
    serie: options.serie || '00001',
    ndps: options.numero || '1'
  });
}

function renderizarGradeDadosNota(
  ctx: ContextoRenderizacaoDanfse,
  dadosColW: number,
  options: DanfsePdfOptions,
  chave: string
): void {
  const cW3 = dadosColW / 3;
  const rowH = 19;
  let rY = ctx.currentY - 25;

  const dataEmissao = options.dataEmissao || new Date().toISOString();
  desenharCampo(ctx, ctx.marginX, rY, cW3, rowH, 'Número da NFS-e', options.numero || '1', true, CORES_DANFSE.fieldBg);
  desenharCampo(ctx, ctx.marginX + cW3, rY, cW3, rowH, 'Competência', options.competencia || dataEmissao.slice(0, 10));
  desenharCampo(ctx, ctx.marginX + cW3 * 2, rY, cW3, rowH, 'Data/Hora Emissão NFS-e', dataEmissao.replace('T', ' ').slice(0, 19));

  rY -= rowH;
  desenharCampo(ctx, ctx.marginX, rY, cW3, rowH, 'Número da DPS', options.numero || '1', false);
  desenharCampo(ctx, ctx.marginX + cW3, rY, cW3, rowH, 'Série da DPS', options.serie || '00001', false);
  desenharCampo(ctx, ctx.marginX + cW3 * 2, rY, cW3, rowH, 'Data/Hora Emissão DPS', dataEmissao.slice(0, 10));

  rY -= rowH;
  desenharCampo(ctx, ctx.marginX, rY, cW3, rowH, 'Emitente da NFS-e', 'Prestador', false);
  desenharCampo(ctx, ctx.marginX + cW3, rY, cW3, rowH, 'Situação da NFS-e', options.cancelada ? 'CANCELADA' : 'EMITIDA COM SUCESSO', true);
  const codVerif = options.codigoVerificacao || chave.slice(chave.length - 8).toUpperCase();
  desenharCampo(ctx, ctx.marginX + cW3 * 2, rY, cW3, rowH, 'Código de Verificação', codVerif);
}

function renderizarQuadroQrCode(
  ctx: ContextoRenderizacaoDanfse,
  dadosColW: number,
  qrColW: number,
  qrImg?: PDFImage
): void {
  const qrBoxX = ctx.marginX + dadosColW;
  if (qrImg) {
    ctx.page.drawImage(qrImg, {
      x: qrBoxX + (qrColW - 58) / 2,
      y: ctx.currentY - 58 - 4,
      width: 58,
      height: 58
    });
  }
  ctx.page.drawText('Consulte pela chave ou QR Code', {
    x: qrBoxX + 5,
    y: ctx.currentY - 68,
    size: 5,
    font: ctx.fontRegular,
    color: CORES_DANFSE.grayText
  });
  ctx.page.drawText('no Portal Nacional da NFS-e', {
    x: qrBoxX + 11,
    y: ctx.currentY - 76,
    size: 5,
    font: ctx.fontRegular,
    color: CORES_DANFSE.grayText
  });
}
