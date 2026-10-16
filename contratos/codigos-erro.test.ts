/**
 * Teste unitário para validar o catálogo de códigos de erro em /contratos.
 * Garante que os erros esperados pelo Noto, Fiscal e IA permaneçam imutáveis.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CODIGOS_ERRO_FISCAL, CODIGOS_ERRO_IA } from './codigos-erro.js';

describe('Catálogo de Códigos de Erro em /contratos', () => {
  it('deve conter todos os códigos de erro essenciais do serviço fiscal', () => {
    assert.equal(CODIGOS_ERRO_FISCAL.CERTIFICADO_EXPIRADO, 'CERTIFICADO_EXPIRADO');
    assert.equal(CODIGOS_ERRO_FISCAL.SENHA_INVALIDA, 'SENHA_INVALIDA');
    assert.equal(CODIGOS_ERRO_FISCAL.REJEICAO_SEFIN, 'REJEICAO_SEFIN');
    assert.equal(CODIGOS_ERRO_FISCAL.SERPRO_INDISPONIVEL, 'SERPRO_INDISPONIVEL');
  });

  it('deve conter todos os códigos de erro essenciais do serviço de IA', () => {
    assert.equal(CODIGOS_ERRO_IA.CONVERSA_SEM_MENSAGENS, 'CONVERSA_SEM_MENSAGENS');
    assert.equal(CODIGOS_ERRO_IA.MIDIA_ILEGIVEL, 'MIDIA_ILEGIVEL');
    assert.equal(CODIGOS_ERRO_IA.PROVEDOR_IA_INDISPONIVEL, 'PROVEDOR_IA_INDISPONIVEL');
  });
});
