/**
 * Testes unitários para as rotas de análise e autocorreção do serviço de IA.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarRouterAnalise } from './rotas-analise.js';

describe('Router de Análise e Autocorreção em /ia', () => {
  it('deve processar POST /v1/analise/detectar-candidatos e retornar decisão estruturada', async () => {
    const app = express();
    app.use(express.json());
    app.use('/v1', criarRouterAnalise());

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      const resp = await fetch(`http://127.0.0.1:${porta}/v1/analise/detectar-candidatos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicoId: 'med-1',
          dadosMedico: { nome: 'Dr. Lucas', cpfCnpj: '123' },
          conversa: {
            conversaId: 'conv-1',
            contatoTelefone: '5511999998888',
            pacienteNomeCadastrado: 'Carla Dias',
            mensagens: [
              { id: '1', direcao: 'enviada', tipo: 'texto', conteudo: 'Sua consulta é dia 10/10', timestamp: '2026-10-01T10:00:00.000Z' },
              { id: '2', direcao: 'recebida', tipo: 'documento', timestamp: '2026-10-10T12:00:00.000Z' }
            ]
          }
        })
      });

      const body = await resp.json() as any;

      assert.equal(resp.status, 200);
      assert.equal(body.sucesso, true);
      assert.equal(body.candidatoDetectado, true);
      assert.ok(body.perguntaSugeridaMedico.includes('Carla Dias'));
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('deve processar POST /v1/analise/autocorrigir-falha e sugerir correção autônoma', async () => {
    const app = express();
    app.use(express.json());
    app.use('/v1', criarRouterAnalise());

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      const resp = await fetch(`http://127.0.0.1:${porta}/v1/analise/autocorrigir-falha`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          medicoId: 'med-1',
          pedidoId: 'ped-1',
          erroSefin: { codigo: 'E172', mensagem: 'Contribuinte não é MEI' }
        })
      });

      const body = await resp.json() as any;

      assert.equal(resp.status, 200);
      assert.equal(body.sucesso, true);
      assert.equal(body.podeCorrigirAutonomamente, true);
      assert.equal(body.diagnostico, 'conflito_regime_tributario_mei');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
