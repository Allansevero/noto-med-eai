/**
 * Renderização dos blocos de serviços, tributação, totais e complementos do DANFSe v2.0.
 * Inclui o quadro de destaque do valor líquido em verde suave e marca d'água de homologação/cancelamento.
 */

import { rgb, degrees } from 'pdf-lib';
import type { DanfsePdfOptions, DanfseServico, DanfsePrestador } from './danfse-pdf-options.js';
import {
  type ContextoRenderizacaoDanfse,
  CORES_DANFSE,
  desenharCaixa,
  desenharCampo,
  desenharTituloSecao
} from './renderizar-secoes-danfse.js';

export function renderizarServico(
  ctx: ContextoRenderizacaoDanfse,
  servico: DanfseServico = {},
  prestador: DanfsePrestador = {}
): void {
  desenharTituloSecao(ctx, 'Serviço Prestado');
  const colW4 = ctx.contentWidth / 4;

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4, 18, 'Cód. Tributação Nacional', servico.cTribNac || '041601', true);
  desenharCampo(ctx, ctx.marginX + colW4, ctx.currentY, colW4, 18, 'Código da NBS', servico.cNBS || '123011300');
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4 * 2, 18, 'Local da Prestação', `${prestador.municipio || ''} - ${prestador.uf || ''} / Brasil`);
  ctx.currentY -= 18;

  renderizarDiscriminacaoServicos(ctx, servico.discriminacao || '');
}

function renderizarDiscriminacaoServicos(ctx: ContextoRenderizacaoDanfse, rawDesc: string): void {
  const descH = 46;
  desenharCaixa(ctx, ctx.marginX, ctx.currentY - descH, ctx.contentWidth, descH);
  ctx.page.drawText('DISCRIMINAÇÃO DOS SERVIÇOS', {
    x: ctx.marginX + 4,
    y: ctx.currentY - 8,
    size: 5.5,
    font: ctx.fontBold,
    color: CORES_DANFSE.grayText
  });

  const linhas = quebrarLinhasDescricao(rawDesc, 95);
  let descY = ctx.currentY - 20;
  for (const line of linhas.slice(0, 3)) {
    ctx.page.drawText(line, { x: ctx.marginX + 6, y: descY, size: 7.5, font: ctx.fontRegular, color: CORES_DANFSE.black });
    descY -= 11;
  }
  ctx.currentY -= descH;
}

function quebrarLinhasDescricao(texto: string, maxCharsPorLinha: number): string[] {
  const descLines: string[] = [];
  let currentLine = '';
  for (const word of texto.split(' ')) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPorLinha) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      descLines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) descLines.push(currentLine);
  return descLines;
}

export function renderizarTributacaoMunicipal(
  ctx: ContextoRenderizacaoDanfse,
  servico: DanfseServico = {},
  prestador: DanfsePrestador = {}
): void {
  desenharTituloSecao(ctx, 'Tributação Municipal (ISSQN)');
  const colW4 = ctx.contentWidth / 4;

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4, 19, 'Tipo de Tributação', 'Operação Tributável');
  desenharCampo(ctx, ctx.marginX + colW4, ctx.currentY, colW4, 19, 'Município de Incidência', `${prestador.municipio || ''} - ${prestador.uf || ''}`);
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4, 19, 'Regime Especial', 'Nenhum');
  desenharCampo(ctx, ctx.marginX + colW4 * 3, ctx.currentY, colW4, 19, 'Retenção ISSQN', 'Não Retido');
  ctx.currentY -= 19;

  const vServ = (servico.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const aliq = (servico.aliquota || 2).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const vIss = (servico.issApurado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4, 19, 'Base de Cálculo ISSQN', `R$ ${vServ}`);
  desenharCampo(ctx, ctx.marginX + colW4, ctx.currentY, colW4, 19, 'Alíquota Aplicada', `${aliq}%`);
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4, 19, 'ISSQN Apurado', `R$ ${vIss}`);
  desenharCampo(ctx, ctx.marginX + colW4 * 3, ctx.currentY, colW4, 19, 'Total Deduções / Reduções', 'R$ 0,00');
  ctx.currentY -= 19;
}

export function renderizarTotaisEValorLiquido(ctx: ContextoRenderizacaoDanfse, servico: DanfseServico = {}): void {
  desenharTituloSecao(ctx, 'Valores Totais da NFS-e');
  const colW4 = ctx.contentWidth / 4;
  const totH = 24;
  const vServ = (servico.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4, totH, 'Valor dos Serviços', `R$ ${vServ}`, true);
  desenharCampo(ctx, ctx.marginX + colW4, ctx.currentY, colW4, totH, 'Desconto Incondicionado', 'R$ 0,00');
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4, totH, 'Total Retenções Federais', 'R$ 0,00');

  // Quadro de destaque do Valor Líquido
  const valLiq = (servico.valor || 0) - (servico.desconto || 0) - (servico.retencoes || 0);
  const xLiq = ctx.marginX + colW4 * 3;
  desenharCaixa(ctx, xLiq, ctx.currentY - totH, colW4, totH, CORES_DANFSE.greenBadgeBg);
  ctx.page.drawText('VALOR LÍQUIDO DA NFS-e', {
    x: xLiq + 3,
    y: ctx.currentY - 8,
    size: 6,
    font: ctx.fontBold,
    color: CORES_DANFSE.greenBadgeText
  });
  ctx.page.drawText(`R$ ${valLiq.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, {
    x: xLiq + 3,
    y: ctx.currentY - 19,
    size: 10,
    font: ctx.fontBold,
    color: CORES_DANFSE.greenBadgeText
  });
  ctx.currentY -= totH;
}

export function renderizarInformacoesComplementares(
  ctx: ContextoRenderizacaoDanfse,
  prestador: DanfsePrestador = {}
): void {
  desenharTituloSecao(ctx, 'Informações Complementares', 11);
  const infoH = 48;
  desenharCaixa(ctx, ctx.marginX, ctx.currentY - infoH, ctx.contentWidth, infoH);

  const textos = [
    prestador.simplesNacional
      ? 'I - Documento emitido por ME ou EPP optante pelo Simples Nacional (Microempreendedor Individual ou EPP).'
      : 'I - Empresa tributada pelo Lucro Presumido/Real. CBS e IBS apurados conforme RTC/2026.',
    'II - Não gera direito a crédito fiscal de IPI ou ISSQN.',
    'III - Total aproximado de tributos federais, estaduais e municipais: R$ 0,00 (dispensado conforme Decreto Federal nº 8.264/2014).',
    'IV - NFS-e emitida em conformidade com o Convênio Nacional da NFS-e (Lei Complementar nº 116/2003 e Resolução CGSN nº 169/2022).'
  ];

  let infoY = ctx.currentY - 11;
  for (const t of textos) {
    ctx.page.drawText(t, { x: ctx.marginX + 6, y: infoY, size: 6, font: ctx.fontRegular, color: CORES_DANFSE.grayText });
    infoY -= 10;
  }
  ctx.currentY -= infoH;
}

export function renderizarMarcaDagua(ctx: ContextoRenderizacaoDanfse, options: DanfsePdfOptions): void {
  if (options.cancelada) {
    ctx.page.drawText('CANCELADA', {
      x: ctx.width / 2 - 170,
      y: ctx.height / 2 - 40,
      size: 62,
      font: ctx.fontBold,
      color: rgb(0.9, 0.15, 0.15),
      opacity: 0.28,
      rotate: degrees(35)
    });
    return;
  }

  if (options.ambiente === 'homologacao') {
    ctx.page.drawText('HOMOLOGAÇÃO / SEM VALOR', {
      x: ctx.width / 2 - 210,
      y: ctx.height / 2 - 40,
      size: 38,
      font: ctx.fontBold,
      color: rgb(0.85, 0.2, 0.2),
      opacity: 0.22,
      rotate: degrees(30)
    });
  }
}
