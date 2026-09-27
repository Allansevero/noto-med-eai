import { describe, it, mock } from 'node:test';
import assert from 'node:assert/strict';
import { HubDesenvolvedorCpfClient } from './hub-desenvolvedor-cpf-client.js';

describe('HubDesenvolvedorCpfClient', () => {
  const tokenValido = 'fake-hub-token-123';

  it('deve retornar null se CPF não possuir 11 dígitos', async () => {
    const cliente = new HubDesenvolvedorCpfClient(tokenValido);
    const res = await cliente.consultar('123');
    assert.equal(res, null);
  });

  it('deve retornar null se token estiver vazio', async () => {
    const cliente = new HubDesenvolvedorCpfClient('');
    const res = await cliente.consultar('12345678909');
    assert.equal(res, null);
  });

  it('deve limpar pontuação do CPF e fazer requisição GET com sucesso', async () => {
    let urlChamada = '';
    const mockFetch = mock.fn(async (url: string | URL | Request) => {
      urlChamada = String(url);
      return new Response(
        JSON.stringify({
          status: true,
          return: 'OK',
          consumed: 1,
          result: {
            numero_de_cpf: '12345678909',
            nome_da_pf: 'JOAO DA SILVA',
            data_nascimento: '15/05/1985',
            situacao_cadastral: 'REGULAR'
          }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    });

    // Sobrescreve global fetch temporariamente
    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as any;

    try {
      const cliente = new HubDesenvolvedorCpfClient(tokenValido, { baseUrl: 'https://test.hub.com' });
      const resultado = await cliente.consultar('123.456.789-09');

      assert.ok(urlChamada.includes('cpf=12345678909'));
      assert.ok(urlChamada.includes(`token=${tokenValido}`));
      assert.deepEqual(resultado, {
        nome: 'JOAO DA SILVA',
        dataNascimento: new Date(Date.UTC(1985, 4, 15)),
        situacaoCadastral: 'REGULAR'
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('deve tratar barras escapadas na data de nascimento', async () => {
    const mockFetch = mock.fn(async () => {
      return new Response(
        JSON.stringify({
          status: true,
          return: 'OK',
          result: {
            nome_da_pf: 'MARIA APARECIDA',
            data_nascimento: '20\\/10\\/1990'
          }
        }),
        { status: 200 }
      );
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as any;

    try {
      const cliente = new HubDesenvolvedorCpfClient(tokenValido);
      const resultado = await cliente.consultar('98765432100');

      assert.equal(resultado?.nome, 'MARIA APARECIDA');
      assert.deepEqual(resultado?.dataNascimento, new Date(Date.UTC(1990, 9, 20)));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('deve retornar null se status da API for false', async () => {
    const mockFetch = mock.fn(async () => {
      return new Response(
        JSON.stringify({
          status: false,
          return: 'NOK',
          message: 'Parametro Invalido.'
        }),
        { status: 200 }
      );
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as any;

    try {
      const cliente = new HubDesenvolvedorCpfClient(tokenValido);
      const resultado = await cliente.consultar('00000000000');
      assert.equal(resultado, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('deve retornar null se HTTP retornar código de erro', async () => {
    const mockFetch = mock.fn(async () => {
      return new Response('Unauthorized', { status: 401 });
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as any;

    try {
      const cliente = new HubDesenvolvedorCpfClient(tokenValido);
      const resultado = await cliente.consultar('12345678909');
      assert.equal(resultado, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('deve tratar exceção de rede sem quebrar a execução', async () => {
    const mockFetch = mock.fn(async () => {
      throw new Error('Connection timeout');
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = mockFetch as any;

    try {
      const cliente = new HubDesenvolvedorCpfClient(tokenValido);
      const resultado = await cliente.consultar('12345678909');
      assert.equal(resultado, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
