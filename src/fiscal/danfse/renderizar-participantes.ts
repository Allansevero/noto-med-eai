/**
 * Renderização dos blocos de participantes do DANFSe v2.0 (Prestador e Tomador).
 * Organiza em grades padronizadas de 3 linhas cada, com destaque para documentos e Simples.
 */

import type { DanfsePrestador, DanfseTomador } from './danfse-pdf-options.js';
import {
  type ContextoRenderizacaoDanfse,
  CORES_DANFSE,
  desenharCampo,
  desenharTituloSecao
} from './renderizar-secoes-danfse.js';

export function renderizarPrestador(ctx: ContextoRenderizacaoDanfse, prestador: DanfsePrestador = {}): void {
  desenharTituloSecao(ctx, 'Prestador / Fornecedor');
  const colW4 = ctx.contentWidth / 4;
  const optSimples = prestador.simplesNacional ? 'Optante - ME/EPP' : 'Não Optante';

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4, 19, 'CNPJ / CPF', prestador.cnpj || '-', true);
  desenharCampo(ctx, ctx.marginX + colW4, ctx.currentY, colW4, 19, 'Inscrição Municipal', prestador.inscricaoMunicipal || '-');
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4, 19, 'Telefone', prestador.telefone || '-');
  desenharCampo(ctx, ctx.marginX + colW4 * 3, ctx.currentY, colW4, 19, 'Opção Simples Nacional', optSimples, false, CORES_DANFSE.fieldBg);
  ctx.currentY -= 19;

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4 * 2, 19, 'Nome / Nome Empresarial', (prestador.razaoSocial || '').toUpperCase(), true);
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4, 19, 'Município / UF', `${prestador.municipio || ''} - ${prestador.uf || ''}`);
  desenharCampo(ctx, ctx.marginX + colW4 * 3, ctx.currentY, colW4, 19, 'CEP', prestador.cep || '-');
  ctx.currentY -= 19;

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4 * 2.5, 19, 'Endereço', prestador.endereco || '-');
  desenharCampo(ctx, ctx.marginX + colW4 * 2.5, ctx.currentY, colW4 * 1.5, 19, 'E-mail', (prestador.email || '-').toLowerCase());
  ctx.currentY -= 19;
}

export function renderizarTomador(ctx: ContextoRenderizacaoDanfse, tomador: DanfseTomador = {}): void {
  desenharTituloSecao(ctx, 'Tomador / Adquirente');
  const colW4 = ctx.contentWidth / 4;

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4, 19, 'CPF / CNPJ', tomador.cpf || '-', true);
  desenharCampo(ctx, ctx.marginX + colW4, ctx.currentY, colW4, 19, 'Inscrição Municipal', tomador.inscricaoMunicipal || '-');
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4 * 2, 19, 'Telefone', tomador.telefone || '-');
  ctx.currentY -= 19;

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4 * 2, 19, 'Nome / Nome Empresarial', (tomador.nome || '').toUpperCase(), true);
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4, 19, 'Município / UF', `${tomador.municipio || ''} - ${tomador.uf || ''}`);
  desenharCampo(ctx, ctx.marginX + colW4 * 3, ctx.currentY, colW4, 19, 'CEP', tomador.cep || '-');
  ctx.currentY -= 19;

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4 * 2.5, 19, 'Endereço', tomador.endereco || '-');
  desenharCampo(ctx, ctx.marginX + colW4 * 2.5, ctx.currentY, colW4 * 1.5, 19, 'E-mail', (tomador.email || '-').toLowerCase());
  ctx.currentY -= 19;
}
