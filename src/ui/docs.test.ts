/**
 * Testes unitários para a página de documentação interativa /docs.
 * Valida a existência do arquivo HTML e a presença das seções essenciais.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Página de Documentação Técnica /docs', () => {
  const caminhoDocsHtml = join(__dirname, 'docs.html');

  it('deve existir o arquivo docs.html em src/ui', () => {
    assert.equal(existsSync(caminhoDocsHtml), true);
  });

  it('deve conter a sidebar e as seções dos 3 serviços isolados', () => {
    const conteudo = readFileSync(caminhoDocsHtml, 'utf-8');

    // Sidebar e elementos estruturais
    assert.ok(conteudo.includes('class="sidebar"'));
    assert.ok(conteudo.includes('class="nav-link"'));

    // Seções dos 3 serviços
    assert.ok(conteudo.includes('id="servico-fiscal"'));
    assert.ok(conteudo.includes('id="servico-ia"'));
    assert.ok(conteudo.includes('id="servico-noto"'));
    assert.ok(conteudo.includes('id="contratos-api"'));

    // Seção Como Implementar no Docs
    assert.ok(conteudo.includes('id="como-implementar-docs"'));
    assert.ok(conteudo.includes('Como Implementar no Docs'));

    // Links de conexão interna
    assert.ok(conteudo.includes('http://fiscal:3001'));
    assert.ok(conteudo.includes('http://ia:3002'));
    assert.ok(conteudo.includes('X-Internal-Token'));

    // Seções para LLMs e Agentes
    assert.ok(conteudo.includes('id="contexto-llms"'));
    assert.ok(conteudo.includes('id="dicionario-endpoints"'));
    assert.ok(conteudo.includes('Prompt Mestre para Agentes de IA'));
    assert.ok(conteudo.includes('/v1/onboarding/certificado'));
    assert.ok(conteudo.includes('/v1/notas/emitir'));
    assert.ok(conteudo.includes('/v1/analise/detectar-candidatos'));
    assert.ok(conteudo.includes('/v1/analise/autocorrigir-falha'));
  });

  it('deve existir o arquivo llms.txt estruturado para consumo por outras LLMs', () => {
    const caminhoLlmsTxt = join(__dirname, 'llms.txt');
    assert.equal(existsSync(caminhoLlmsTxt), true);

    const conteudoLlms = readFileSync(caminhoLlmsTxt, 'utf-8');
    assert.ok(conteudoLlms.includes('X-Internal-Token'));
    assert.ok(conteudoLlms.includes('http://fiscal:3001'));
    assert.ok(conteudoLlms.includes('http://ia:3002'));
    assert.ok(conteudoLlms.includes('/v1/notas/emitir'));
    assert.ok(conteudoLlms.includes('/v1/analise/detectar-candidatos'));
    assert.ok(conteudoLlms.includes('/v1/analise/autocorrigir-falha'));
  });
});
