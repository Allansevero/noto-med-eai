/**
 * Renderização dos blocos de participantes do DANFSe v2.0 (Prestador e Tomador).
 * Aplica máscaras oficiais para CPF, CNPJ, CEP e telefone, com destaque visual
 * para a Razão Social/Nome e indicação do Simples Nacional / MEI.
 */

import type { DanfsePrestador, DanfseTomador } from './danfse-pdf-options.js';
import {
  type ContextoRenderizacaoDanfse,
  CORES_DANFSE,
  desenharCampo,
  desenharTituloSecao
} from './renderizar-secoes-danfse.js';
import {
  formatarDocumento,
  formatarTelefone,
  formatarCep,
  resolverNomeMunicipio
} from './formatadores-fiscais.js';

export function renderizarPrestador(ctx: ContextoRenderizacaoDanfse, prestador: DanfsePrestador = {}): void {
  desenharTituloSecao(ctx, 'Prestador de Serviços');
  const colW4 = ctx.contentWidth / 4;
  const optSimples = prestador.simplesNacional ? 'Optante - ME/EPP' : 'Não Optante';

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4, 19, 'CNPJ / CPF', formatarDocumento(prestador.cnpj), true);
  desenharCampo(ctx, ctx.marginX + colW4, ctx.currentY, colW4, 19, 'Inscrição Municipal', prestador.inscricaoMunicipal || '-');
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4, 19, 'Telefone', formatarTelefone(prestador.telefone));
  desenharCampo(ctx, ctx.marginX + colW4 * 3, ctx.currentY, colW4, 19, 'Opção Simples Nacional', optSimples, false, CORES_DANFSE.fieldBg);
  ctx.currentY -= 19;

  const razaoSocial = (prestador.razaoSocial || prestador.nomeFantasia || '-').toUpperCase();
  const munUf = `${resolverNomeMunicipio(prestador.municipio, prestador.municipio)} - ${(prestador.uf || 'RS').toUpperCase()}`;
  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4 * 2, 19, 'Nome / Nome Empresarial', razaoSocial, true);
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4, 19, 'Município / UF', munUf);
  desenharCampo(ctx, ctx.marginX + colW4 * 3, ctx.currentY, colW4, 19, 'CEP', formatarCep(prestador.cep));
  ctx.currentY -= 19;

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4 * 2.5, 19, 'Endereço', prestador.endereco || '-');
  desenharCampo(ctx, ctx.marginX + colW4 * 2.5, ctx.currentY, colW4 * 1.5, 19, 'E-mail', (prestador.email || '-').toLowerCase());
  ctx.currentY -= 19;
}

export function renderizarTomador(
  ctx: ContextoRenderizacaoDanfse,
  tomador: DanfseTomador = {},
  prestador: DanfsePrestador = {}
): void {
  desenharTituloSecao(ctx, 'Tomador de Serviços');
  const colW4 = ctx.contentWidth / 4;

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4, 19, 'CPF / CNPJ', formatarDocumento(tomador.cpf), true);
  desenharCampo(ctx, ctx.marginX + colW4, ctx.currentY, colW4, 19, 'Inscrição Municipal', tomador.inscricaoMunicipal || '-');
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4 * 2, 19, 'Telefone', formatarTelefone(tomador.telefone));
  ctx.currentY -= 19;

  const nomeTomador = (tomador.nome || '-').toUpperCase();
  const munUf = `${resolverNomeMunicipio(tomador.municipio, tomador.municipio || prestador.municipio)} - ${(tomador.uf || prestador.uf || 'RS').toUpperCase()}`;
  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4 * 2, 19, 'Nome / Nome Empresarial', nomeTomador, true);
  desenharCampo(ctx, ctx.marginX + colW4 * 2, ctx.currentY, colW4, 19, 'Município / UF', munUf);
  desenharCampo(ctx, ctx.marginX + colW4 * 3, ctx.currentY, colW4, 19, 'CEP', formatarCep(tomador.cep));
  ctx.currentY -= 19;

  desenharCampo(ctx, ctx.marginX, ctx.currentY, colW4 * 2.5, 19, 'Endereço', tomador.endereco || '-');
  desenharCampo(ctx, ctx.marginX + colW4 * 2.5, ctx.currentY, colW4 * 1.5, 19, 'E-mail', (tomador.email || '-').toLowerCase());
  ctx.currentY -= 19;
}
