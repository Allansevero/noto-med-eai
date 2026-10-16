/**
 * Gerador do Documento Auxiliar da NFS-e (DANFSE Nacional) em PDF via pdf-lib.
 * Produz o arquivo binário em formato A4 contendo dados do prestador, tomador,
 * discriminação do serviço, alíquotas de ISS/RTC e chave de acesso.
 */

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { formatarDocumento, formatarMoedaCentavos } from './formatadores-fiscais.js';

export interface DanfseDadosEntrada {
  numeroNota: string;
  serie: string;
  chaveAcesso: string;
  dataEmissao: string;
  prestador: {
    nome: string;
    documento: string;
    municipio?: string;
  };
  tomador: {
    nome: string;
    documento: string;
  };
  servico: {
    discriminacao: string;
    valorCentavos: number;
    aliquotaIss?: number;
  };
}

export async function gerarDanfsePdf(dados: DanfseDadosEntrada): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 padrão
  const { height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const corPrimaria = rgb(0.1, 0.2, 0.4);
  const corTexto = rgb(0.15, 0.15, 0.15);

  let y = height - 40;

  // Cabeçalho
  page.drawText('DANFSE - DOCUMENTO AUXILIAR DA NFS-E NACIONAL', {
    x: 40,
    y,
    size: 14,
    font: fontBold,
    color: corPrimaria
  });

  y -= 25;
  page.drawText(`Número: ${dados.numeroNota}  |  Série: ${dados.serie}  |  Emissão: ${dados.dataEmissao.slice(0, 10)}`, {
    x: 40,
    y,
    size: 10,
    font: fontRegular,
    color: corTexto
  });

  y -= 18;
  page.drawText(`Chave de Acesso: ${dados.chaveAcesso}`, {
    x: 40,
    y,
    size: 9,
    font: fontBold,
    color: corTexto
  });

  // Linha divisória
  y -= 15;
  page.drawLine({
    start: { x: 40, y },
    end: { x: 555, y },
    thickness: 1,
    color: corPrimaria
  });

  // Prestador
  y -= 25;
  page.drawText('PRESTADOR DE SERVIÇOS', { x: 40, y, size: 10, font: fontBold, color: corPrimaria });
  y -= 16;
  page.drawText(`Razão Social / Nome: ${dados.prestador.nome}`, { x: 40, y, size: 9, font: fontRegular, color: corTexto });
  y -= 14;
  page.drawText(`CPF/CNPJ: ${formatarDocumento(dados.prestador.documento)}  |  Município: ${dados.prestador.municipio || 'Nacional'}`, {
    x: 40,
    y,
    size: 9,
    font: fontRegular,
    color: corTexto
  });

  // Tomador
  y -= 25;
  page.drawText('TOMADOR DE SERVIÇOS', { x: 40, y, size: 10, font: fontBold, color: corPrimaria });
  y -= 16;
  page.drawText(`Nome / Razão Social: ${dados.tomador.nome}`, { x: 40, y, size: 9, font: fontRegular, color: corTexto });
  y -= 14;
  page.drawText(`CPF/CNPJ: ${formatarDocumento(dados.tomador.documento)}`, { x: 40, y, size: 9, font: fontRegular, color: corTexto });

  // Discriminação do Serviço
  y -= 25;
  page.drawText('DISCRIMINAÇÃO DOS SERVIÇOS', { x: 40, y, size: 10, font: fontBold, color: corPrimaria });
  y -= 16;
  page.drawText(dados.servico.discriminacao.slice(0, 180), { x: 40, y, size: 9, font: fontRegular, color: corTexto });

  // Valores e Totais
  y -= 30;
  page.drawText('VALORES TOTAIS', { x: 40, y, size: 10, font: fontBold, color: corPrimaria });
  y -= 16;
  const valorFormatado = formatarMoedaCentavos(dados.servico.valorCentavos);
  const aliquotaFormatada = dados.servico.aliquotaIss ? `${dados.servico.aliquotaIss.toFixed(2)}%` : '2.01%';
  page.drawText(`Valor do Serviço: ${valorFormatado}  |  Alíquota ISS: ${aliquotaFormatada}`, {
    x: 40,
    y,
    size: 10,
    font: fontBold,
    color: corTexto
  });

  return pdfDoc.save();
}
