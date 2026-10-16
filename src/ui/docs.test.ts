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
  });
});
