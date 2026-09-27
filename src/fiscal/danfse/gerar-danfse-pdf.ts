/**
 * Gerador oficial do DANFSe v2.0 (Documento Auxiliar da NFS-e Padrão Nacional) em PDF.
 * Implementa integralmente as diretrizes da NT 008/2026 v1.02 e RTC 2026 (IBS/CBS),
 * gerando um documento 100% vetorial com pdf-lib e qrcode, sem navegadores ou Puppeteer.
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
  renderizarTributacaoFederalEReforma,
  renderizarTotaisEValorLiquido,
  renderizarInformacoesComplementares,
  renderizarMarcaDagua
} from './renderizar-servicos-e-totais.js';
import { comporChaveAcessoNacional } from './formatadores-fiscais.js';

export async function generateDanfsePdf(options: DanfsePdfOptions = {}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 padrão
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

  const chaveLimpa = obterOuGerarChave50(options);
  const qrImg = await gerarImagemQrCode(pdfDoc, chaveLimpa);

  renderizarCabecalho(ctx, options);
  renderizarDadosNotaEQrCode(ctx, options, qrImg);
  renderizarPrestador(ctx, options.prestador);
  renderizarTomador(ctx, options.tomador, options.prestador);
  renderizarServico(ctx, options.servico, options.prestador);
  renderizarTributacaoMunicipal(ctx, options.servico, options.prestador);
  renderizarTributacaoFederalEReforma(ctx, options.servico, options.prestador);
  renderizarTotaisEValorLiquido(ctx, options.servico);
  renderizarInformacoesComplementares(ctx, options.prestador);
  renderizarMarcaDagua(ctx, options);

  return pdfDoc.save();
}

export const gerarDanfsePdf = generateDanfsePdf;

function obterOuGerarChave50(options: DanfsePdfOptions): string {
  const chaveLimpa = (options.chaveAcesso || '').replace(/\D/g, '');
  if (chaveLimpa.length === 50) return chaveLimpa;

  return comporChaveAcessoNacional({
    codIbgeMunicipio: options.prestador?.municipio || '4314902',
    ambiente: options.ambiente || 'producao',
    anoMes: options.competencia || new Date().toISOString().slice(0, 7),
    cnpjOuCpf: options.prestador?.cnpj || '33841732000190',
    serie: options.serie || '00001',
    ndps: options.numero || '1'
  });
}

async function gerarImagemQrCode(pdfDoc: PDFDocument, chave50: string): Promise<PDFImage | undefined> {
  const qrUrl = `https://www.nfse.gov.br/ConsultaPublica/?tpc=1&chave=${chave50}`;

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
