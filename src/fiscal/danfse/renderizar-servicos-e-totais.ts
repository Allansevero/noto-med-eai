/**
 * Renderização dos blocos de serviços, tributação municipal (ISSQN),
 * tributação federal (exceto CBS), tributação IBS/CBS (RTC 2026),
 * valores totais, informações complementares e canhoto de cientificação.
 * Segue 1:1 o layout oficial do Portal Nacional da NFS-e.
 */

import { degrees, rgb } from 'pdf-lib';
import type { DanfsePdfOptions, DanfseServico, DanfsePrestador } from './danfse-pdf-options.js';
import {
  type ContextoRenderizacaoDanfse,
  CORES_DANFSE,
  desenharCaixa,
  desenharCelula
} from './renderizar-secoes-danfse.js';
import { resolverNomeMunicipio } from './formatadores-fiscais.js';

export function renderizarServico(
  ctx: ContextoRenderizacaoDanfse,
  servico: DanfseServico = {},
  prestador: DanfsePrestador = {}
): void {
  const rowH = 16;
  let y = ctx.currentY;

  // Linha 1: Título | Código Trib Nac/Mun | Código NBS | Local da Prestação
  const municipio = servico.municipioPrestacao ?? prestador.municipio;
  const munNome = resolverNomeMunicipio(municipio, municipio);
  const locPrest = `${munNome} / ${(servico.ufPrestacao || prestador.uf || '-').toUpperCase()} / -`;

  desenharCelula(ctx, ctx.marginX, y, 130, rowH, '', 'SERVIÇO PRESTADO', true);
  desenharCelula(ctx, ctx.marginX + 130, y, 140, rowH, 'Código de Tributação Nacional/Municipal', `${servico.cTribNac || '-'} / -`);
  desenharCelula(ctx, ctx.marginX + 270, y, 145, rowH, 'Código da NBS', servico.cNBS || '-');
  desenharCelula(ctx, ctx.marginX + 415, y, ctx.contentWidth - 415, rowH, 'Local da Prestação / Sigla UF / País', locPrest);
  y -= rowH;

  // Linha 2: Descrição da atividade e Discriminação dos Serviços
  const descH = 26;
  desenharCaixa(ctx, ctx.marginX, y - descH, ctx.contentWidth, descH);

  // Sub-descrição da NBS (linha superior)
  const subTexto = 'Atos e procedimentos médicos, consultas clínicas, diagnósticos e atendimentos profissionais em saúde humana.';
  ctx.page.drawText(subTexto, {
    x: ctx.marginX + 3,
    y: y - 7.5,
    size: 5.5,
    font: ctx.fontRegular,
    color: CORES_DANFSE.grayText
  });

  // Label Descrição do Serviço
  ctx.page.drawText('Descrição do Serviço', {
    x: ctx.marginX + 3,
    y: y - 14.5,
    size: 5.5,
    font: ctx.fontBold,
    color: CORES_DANFSE.black
  });

  // Conteúdo real digitado pelo médico
  const descReal = servico.discriminacao || 'Serviços médicos profissionais.';
  const maxChars = Math.floor(ctx.contentWidth / 4.4);
  const descDisplay = descReal.length > maxChars ? `${descReal.slice(0, maxChars - 3)}...` : descReal;

  ctx.page.drawText(descDisplay, {
    x: ctx.marginX + 3,
    y: y - 22,
    size: 6.8,
    font: ctx.fontRegular,
    color: CORES_DANFSE.black
  });
  y -= descH;

  ctx.currentY = y;
}

export function renderizarTributacaoMunicipal(
  ctx: ContextoRenderizacaoDanfse,
  servico: DanfseServico = {},
  prestador: DanfsePrestador = {}
): void {
  const rowH = 16;
  let y = ctx.currentY;
  const munNome = resolverNomeMunicipio(prestador.municipio, prestador.municipio);

  // Linha 1
  desenharCelula(ctx, ctx.marginX, y, 170, rowH, '', 'TRIBUTAÇÃO MUNICIPAL (ISSQN)', true);
  desenharCelula(ctx, ctx.marginX + 170, y, 175, rowH, 'Tipo de Tributação do ISSQN', servico.tipoTributacao ?? '-');
  desenharCelula(ctx, ctx.marginX + 345, y, ctx.contentWidth - 345, rowH, 'Município / Sigla UF / País de Incidência do ISSQN', '-');
  y -= rowH;

  // Linha 2
  const cW4 = ctx.contentWidth / 4;
  desenharCelula(ctx, ctx.marginX, y, cW4, rowH, 'BC ISSQN', '-');
  desenharCelula(ctx, ctx.marginX + cW4, y, cW4, rowH, 'Alíquota Aplicada', '-');
  desenharCelula(ctx, ctx.marginX + cW4 * 2, y, cW4, rowH, 'Retenção do ISSQN', servico.tipoRetencao ?? '-');
  desenharCelula(ctx, ctx.marginX + cW4 * 3, y, ctx.contentWidth - cW4 * 3, rowH, 'ISSQN Apurado', '-');
  y -= rowH;

  ctx.currentY = y;
}

export function renderizarTributacaoFederalExcetoCbs(ctx: ContextoRenderizacaoDanfse): void {
  const rowH = 16;
  let y = ctx.currentY;

  // Linha 1
  const cW3Dir = (ctx.contentWidth - 170) / 3;
  desenharCelula(ctx, ctx.marginX, y, 170, rowH, '', 'TRIBUTAÇÃO FEDERAL (EXCETO CBS)', true);
  desenharCelula(ctx, ctx.marginX + 170, y, cW3Dir, rowH, 'IRRF', '-');
  desenharCelula(ctx, ctx.marginX + 170 + cW3Dir, y, cW3Dir, rowH, 'Contribuição Previdenciária - Retida', '-');
  desenharCelula(ctx, ctx.marginX + 170 + cW3Dir * 2, y, ctx.contentWidth - 170 - cW3Dir * 2, rowH, 'Contribuições Sociais - Retidas', '-');
  y -= rowH;

  // Linha 2
  desenharCelula(ctx, ctx.marginX, y, 170, rowH, 'PIS - Débito Apuração Própria', '-');
  desenharCelula(ctx, ctx.marginX + 170, y, 175, rowH, 'COFINS - Débito Apuração Própria', '-');
  desenharCelula(ctx, ctx.marginX + 345, y, ctx.contentWidth - 345, rowH, 'Descrição Contrib. Sociais - Retidas', '-');
  y -= rowH;

  ctx.currentY = y;
}

export function renderizarTributacaoIbsCbs(ctx: ContextoRenderizacaoDanfse): void {
  const rowH = 16;
  let y = ctx.currentY;

  // Linha 1
  desenharCelula(ctx, ctx.marginX, y, 140, rowH, '', 'TRIBUTAÇÃO IBS/CBS', true);
  desenharCelula(ctx, ctx.marginX + 140, y, 140, rowH, 'CST / cClassTrib', '- / -');
  desenharCelula(ctx, ctx.marginX + 280, y, ctx.contentWidth - 280, rowH, 'Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF', '- / - / - / -');
  y -= rowH;

  // Linha 2
  const cW4 = ctx.contentWidth / 4;
  desenharCelula(ctx, ctx.marginX, y, cW4, rowH, 'Exclusões e Reduções da Base de Cálculo', '-');
  desenharCelula(ctx, ctx.marginX + cW4, y, cW4, rowH, 'Base de Cálculo Após Exclusões e Reduções', '-');
  desenharCelula(ctx, ctx.marginX + cW4 * 2, y, cW4, rowH, 'Red. Alíquota IBS / Red. Alíquota CBS', '- / - / -');
  desenharCelula(ctx, ctx.marginX + cW4 * 3, y, ctx.contentWidth - cW4 * 3, rowH, 'Alíquota - IBS UF / IBS Mun', '- / -');
  y -= rowH;

  // Linha 3
  desenharCelula(ctx, ctx.marginX, y, cW4, rowH, 'Aliq. Efetiva Municipal - IBS', '-');
  desenharCelula(ctx, ctx.marginX + cW4, y, cW4, rowH, 'Valor Apurado Municipal - IBS', '-');
  desenharCelula(ctx, ctx.marginX + cW4 * 2, y, cW4, rowH, 'Aliq. Efetiva Estadual - IBS', '-');
  desenharCelula(ctx, ctx.marginX + cW4 * 3, y, ctx.contentWidth - cW4 * 3, rowH, 'Valor Apurado Estadual - IBS', '-');
  y -= rowH;

  // Linha 4
  desenharCelula(ctx, ctx.marginX, y, cW4, rowH, 'Valor Total Apurado - IBS', '-');
  desenharCelula(ctx, ctx.marginX + cW4, y, cW4, rowH, 'Alíquota - CBS', '-');
  desenharCelula(ctx, ctx.marginX + cW4 * 2, y, cW4, rowH, 'Alíquota Efetiva - CBS', '-');
  desenharCelula(ctx, ctx.marginX + cW4 * 3, y, ctx.contentWidth - cW4 * 3, rowH, 'Valor Total Apurado - CBS', '-');
  y -= rowH;

  ctx.currentY = y;
}

export function renderizarValoresTotais(ctx: ContextoRenderizacaoDanfse, servico: DanfseServico = {}): void {
  const rowH = 16;
  let y = ctx.currentY;
  const cW4 = ctx.contentWidth / 4;
  const vServ = (servico.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

  // Linha 1
  desenharCelula(ctx, ctx.marginX, y, cW4, rowH, '', 'VALOR TOTAL DA NFS-e', true);
  desenharCelula(ctx, ctx.marginX + cW4, y, cW4, rowH, 'VALOR DA OPERAÇÃO / SERVIÇO', `R$ ${vServ}`, true);
  desenharCelula(ctx, ctx.marginX + cW4 * 2, y, cW4, rowH, 'Desconto Incondicionado', '-');
  desenharCelula(ctx, ctx.marginX + cW4 * 3, y, ctx.contentWidth - cW4 * 3, rowH, 'Desconto Condicionado', '-');
  y -= rowH;

  // Linha 2
  desenharCelula(ctx, ctx.marginX, y, cW4, rowH, 'Total das Retenções (ISSQN / Federais)', '-');
  desenharCelula(ctx, ctx.marginX + cW4, y, cW4, rowH, 'VALOR LÍQUIDO DA NFS-e', `R$ ${vServ}`, true);
  desenharCelula(ctx, ctx.marginX + cW4 * 2, y, cW4, rowH, 'Total do IBS/CBS', '-');
  desenharCelula(ctx, ctx.marginX + cW4 * 3, y, ctx.contentWidth - cW4 * 3, rowH, 'VALOR LÍQUIDO DA NFS-e + IBS/CBS', '-');
  y -= rowH;

  ctx.currentY = y;
}

export function renderizarInformacoesComplementares(ctx: ContextoRenderizacaoDanfse): void {
  const h = 26;
  desenharCaixa(ctx, ctx.marginX, ctx.currentY - h, ctx.contentWidth, h);

  ctx.page.drawText('INFORMAÇÕES COMPLEMENTARES', {
    x: ctx.marginX + 3,
    y: ctx.currentY - 8,
    size: 5.5,
    font: ctx.fontBold,
    color: CORES_DANFSE.black
  });

  const texto = 'Totais aproximados dos Tributos cfe. Lei n° 12.741/2012: Federais: -; Estaduais: -; Municipais: -;';
  ctx.page.drawText(texto, {
    x: ctx.marginX + 3,
    y: ctx.currentY - 17,
    size: 6,
    font: ctx.fontRegular,
    color: CORES_DANFSE.black
  });

  ctx.currentY -= h;
}

export function renderizarCanhotoCientificacao(
  ctx: ContextoRenderizacaoDanfse,
  options: DanfsePdfOptions
): void {
  const yBottom = 20;
  const h = 22;
  const col1W = 145;
  const col2W = 195;
  const col3W = ctx.contentWidth - col1W - col2W;

  // Caixa externa
  desenharCaixa(ctx, ctx.marginX, yBottom, ctx.contentWidth, h);

  // Linhas verticais separadoras
  ctx.page.drawLine({
    start: { x: ctx.marginX + col1W, y: yBottom },
    end: { x: ctx.marginX + col1W, y: yBottom + h },
    thickness: 0.5,
    color: CORES_DANFSE.border
  });
  ctx.page.drawLine({
    start: { x: ctx.marginX + col1W + col2W, y: yBottom },
    end: { x: ctx.marginX + col1W + col2W, y: yBottom + h },
    thickness: 0.5,
    color: CORES_DANFSE.border
  });

  // Coluna 1: Data Cientificação
  ctx.page.drawText('DATA CIENTIFICAÇÃO:', {
    x: ctx.marginX + 3,
    y: yBottom + h - 8,
    size: 6,
    font: ctx.fontBold,
    color: CORES_DANFSE.black
  });

  // Coluna 2: Identificação e Assinatura
  ctx.page.drawText('IDENTIFICAÇÃO E ASSINATURA', {
    x: ctx.marginX + col1W + 3,
    y: yBottom + h - 8,
    size: 6,
    font: ctx.fontBold,
    color: CORES_DANFSE.black
  });

  // Coluna 3: N° NFS-e / Chave
  const xCol3 = ctx.marginX + col1W + col2W;
  ctx.page.drawText('N° NFS-e / CHAVE NFS-e', {
    x: xCol3 + 3,
    y: yBottom + h - 8,
    size: 6,
    font: ctx.fontBold,
    color: CORES_DANFSE.black
  });

  const num = options.numero || '1';
  const chaveLimpa = (options.chaveAcesso || '').replace(/\D/g, '');
  ctx.page.drawText(`${num} / ${chaveLimpa}`, {
    x: xCol3 + 3,
    y: yBottom + 5,
    size: 5.8,
    font: ctx.fontRegular,
    color: CORES_DANFSE.black
  });
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
      size: 30,
      font: ctx.fontBold,
      color: rgb(0.85, 0.15, 0.15),
      opacity: 0.2,
      rotate: degrees(30)
    });
  }
}
