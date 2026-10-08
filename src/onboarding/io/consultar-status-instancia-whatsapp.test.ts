/**
 * Testes unitários para consultar-status-instancia-whatsapp.ts.
 * Simula respostas da Evolution API (open, connecting, erro) e valida a sincronização com o banco.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { consultarStatusInstanciaWhatsapp } from './consultar-status-instancia-whatsapp.js';

describe('consultarStatusInstanciaWhatsapp', () => {
  it('retorna conectado: true e atualiza banco quando state é open', async () => {
    let queryExecutada = false;
    const poolFalso: any = {
      query: async (sql: string, params: any[]) => {
        queryExecutada = true;
        assert.ok(sql.includes('update whatsapp_instancias'));
        assert.equal(params[0], 'medico_123456789012');
        return { rowCount: 1 };
      }
    };

    // Mock global fetch
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async (url: any) => {
      assert.ok(String(url).includes('/instance/connectionState/medico_123456789012'));
      return {
        ok: true,
        json: async () => ({ instance: { state: 'open' } })
      } as any;
    };

    try {
      const res = await consultarStatusInstanciaWhatsapp(poolFalso, {
        medicoId: '12345678-9012-3456-7890-123456789012',
        evolutionUrl: 'https://evolution.test',
        evolutionApiKey: 'chave_teste'
      });

      assert.equal(res.ok, true);
      assert.equal(res.conectado, true);
      assert.equal(res.status, 'conectado');
      assert.equal(res.state, 'open');
      assert.equal(queryExecutada, true);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it('retorna conectado: false quando state é connecting', async () => {
    const poolFalso: any = {
      query: async () => assert.fail('Não deveria atualizar banco se ainda connecting')
    };

    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ instance: { state: 'connecting' } })
    } as any);

    try {
      const res = await consultarStatusInstanciaWhatsapp(poolFalso, {
        medicoId: '12345678-9012-3456-7890-123456789012',
        evolutionUrl: 'https://evolution.test',
        evolutionApiKey: 'chave_teste'
      });

      assert.equal(res.ok, true);
      assert.equal(res.conectado, false);
      assert.equal(res.status, 'pendente');
      assert.equal(res.state, 'connecting');
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });
});

it('resposta sem estado reconhecido não indica desconexão como fato', async () => {
  const fetchOriginal = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ instance: { state: 'unknown' } }) }) as any;
  try {
    const resultado = await consultarStatusInstanciaWhatsapp({ query: async () => assert.fail('Estado desconhecido não altera banco') } as any,
      { medicoId: 'medico', evolutionUrl: 'https://evolution.test', evolutionApiKey: 'teste' });
    assert.equal(resultado.ok, false); assert.equal(resultado.status, 'erro');
  } finally { globalThis.fetch = fetchOriginal; }
});
