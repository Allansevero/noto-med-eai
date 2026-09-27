/**
 * Renderização dos blocos de serviços, tributação municipal (ISSQN),
 * tributação federal (RTC 2026 - IBS/CBS), valores totais e informações complementares.
 * Atende rigorosamente às diretrizes da NT 008/2026 v1.02 e Resolução CGSN 169/2022.
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
import { resolverNomeMunicipio } from './formatadores-fiscais.js';

export function renderizarServico(
  ctx: ContextoRenderizacaoDanfse,
  servico: DanfseServico = {},
  prestador: DanfsePrestador = {}
): void {
  desenharTituloSecao(ctx, 'Serviço Prestado');
  const colW4 = ctx.contentWidth / 4;
  const munUf = `${resolverNomeMunicipio(prestador.municipio, prestador.municipio)} - ${(prestador.uf || 'RS').toUpperCase()}`;

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4, 18, 'Cód. Tributação Nacional', servico.cTribNac || '041601', true);
  desenharCampo(ctx, ctx.marginX + colW4, ctx.currentY, colW4, 18, 'Código da NBS', servico.cNBS || '123011300');
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4 * 2, 18, 'Local da Prestação', `${munUf} / Brasil`);
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
    ctx.page.drawText(line, {
      x: ctx.marginX + 6,
      y: descY,
      size: 7.5,
      font: ctx.fontRegular,
      color: CORES_DANFSE.black
    });
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
  const munUf = `${resolverNomeMunicipio(prestador.municipio, prestador.municipio)} - ${(prestador.uf || 'RS').toUpperCase()}`;

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4, 19, 'Tipo de Tributação', 'Operação Tributável');
  desenharCampo(ctx, ctx.marginX + colW4, ctx.currentY, colW4, 19, 'Município de Incidência', munUf);
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

export function renderizarTributacaoFederalEReforma(
  ctx: ContextoRenderizacaoDanfse,
  servico: DanfseServico = {},
  prestador: DanfsePrestador = {}
): void {
  desenharTituloSecao(ctx, 'Tributação Federal & Reforma Tributária (RTC 2026 - IBS / CBS)');
  const colW4 = ctx.contentWidth / 4;

  const cst = servico.cstIbsCbs || (prestador.simplesNacional ? '000 - Tributável Integralmente' : '000');
  const cClass = servico.cClassTrib || '000001';
  const cIndOp = servico.cIndOp || '030101';
  const vServ = (servico.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4, 19, 'CST IBS/CBS', cst);
  desenharCampo(ctx, ctx.marginX + colW4, ctx.currentY, colW4, 19, 'Classificação Trib.', cClass);
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4, 19, 'Indicador Operação', cIndOp);
  desenharCampo(ctx, ctx.marginX + colW4 * 3, ctx.currentY, colW4, 19, 'Base Cálculo IBS/CBS', `R$ ${vServ}`);
  ctx.currentY -= 19;

  const aliqCbs = (servico.aliquotaCbs || 0).toFixed(2).replace('.', ',');
  const vCbs = (servico.valorCbs || 0).toFixed(2).replace('.', ',');
  const aliqIbs = (servico.aliquotaIbs || 0).toFixed(2).replace('.', ',');
  const vIbs = (servico.valorIbs || 0).toFixed(2).replace('.', ',');

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4, 19, 'Alíquota CBS Federal', `${aliqCbs}%`);
  desenharCampo(ctx, ctx.marginX + colW4, ctx.currentY, colW4, 19, 'CBS Apurada', `R$ ${vCbs}`);
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4, 19, 'Alíquota IBS Est./Mun.', `${aliqIbs}%`);
  desenharCampo(ctx, ctx.marginX + colW4 * 3, ctx.currentY, colW4, 19, 'IBS Apurado', `R$ ${vIbs}`);
  ctx.currentY -= 19;
}

export function renderizarTotaisEValorLiquido(ctx: ContextoRenderizacaoDanfse, servico: DanfseServico = {}): void {
  desenharTituloSecao(ctx, 'Valores Totais da NFS-e');
  const colW4 = ctx.contentWidth / 4;
  const totH = 24;
  const vServ = (servico.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const vDesc = (servico.desconto || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  const vRet = (servico.retencoes || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4, totH, 'Valor dos Serviços', `R$ ${vServ}`, true);
  desenharCampo(ctx, ctx.marginX + colW4, ctx.currentY, colW4, totH, 'Desconto Incondicionado', `R$ ${vDesc}`);
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4, totH, 'Total Retenções Federais', `R$ ${vRet}`);

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
  const infoH = 46;
  desenharCaixa(ctx, ctx.marginX, ctx.currentY - infoH, ctx.contentWidth, infoH);

  const textos = [
    prestador.simplesNacional
      ? 'I - Documento emitido por ME ou EPP optante pelo Simples Nacional (Microempreendedor Individual ou EPP).'
      : 'I - Empresa tributada pelo Lucro Presumido/Real. CBS e IBS apurados conforme RTC/2026.',
    'II - Não gera direito a crédito fiscal de IPI ou ISSQN.',
    'III - Total aproximado de tributos federais, estaduais e municipais: R$ 0,00 (0.00%) - Lei Federal nº 12.741/2012.',
    'IV - NFS-e emitida em conformidade com o Convênio Nacional da NFS-e (Lei Complementar nº 116/2003 e Resolução CGSN nº 169/2022).'
  ];

  let infoY = ctx.currentY - 10;
  for (const t of textos) {
    ctx.page.drawText(t, {
      x: ctx.marginX + 6,
      y: infoY,
      size: 6,
      font: ctx.fontRegular,
      color: CORES_DANFSE.grayText
    });
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
    ctx.page.drawText('NFS-e SEM VALIDADE JURÍDICA', {
      x: ctx.width / 2 - 225,
      y: ctx.height / 2 - 40,
      size: 32,
      font: ctx.fontBold,
      color: rgb(0.85, 0.15, 0.15),
      opacity: 0.22,
      rotate: degrees(30)
    });
  }
}
