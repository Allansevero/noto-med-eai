import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { montarPromptExtracao, formatarDataReferencia } from './montar-prompt-extracao.js';

describe('montarPromptExtracao', () => {
  it('deve incluir data de referência no system prompt e texto da conversa no user prompt', () => {
    const dataRef = new Date(2026, 8, 27, 10, 30); // 27/09/2026 10:30
    const texto = 'Consulta amanhã com Dr. Carlos às 14:30 valor R$ 400';

    const resultado = montarPromptExtracao(texto, dataRef);

    assert.ok(resultado.system.includes('2026-09-27 10:30'));
    assert.ok(resultado.system.includes('valor_centavos'));
    assert.ok(resultado.user.includes('Consulta amanhã com Dr. Carlos'));
  });

  it('formata data de referência em padrão legível', () => {
    const data = new Date(2026, 8, 28, 14, 0);
    const formatada = formatarDataReferencia(data);
    assert.ok(formatada.includes('2026-09-28 14:00'));
  });
});
