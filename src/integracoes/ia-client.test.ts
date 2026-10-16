/**
 * Testes unitários para o IaClient do Noto.
 * Valida chamadas HTTP internas de detecção e autocorreção fiscal.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { IaClient } from './ia-client.js';

describe('IaClient em src/integracoes', () => {
  it('deve chamar /v1/analise/detectar-candidatos e receber decisão formulada', async () => {
    const app = express();
    app.use(express.json());

    app.post('/v1/analise/detectar-candidatos', (req, res) => {
      assert.equal(req.headers['x-internal-token'], 'token-ia-teste');
      res.json({
        sucesso: true,
        candidatoDetectado: true,
        confianca: 0.95,
        perguntaSugeridaMedico: 'Posso emitir a nota de R$ 450,00 da Mariana?',
        dadosFaltantes: ['cpf'],
        perguntaDadosFaltantes: 'Qual o CPF dela?'
      });
    });

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      const client = new IaClient({
        baseUrl: `http://127.0.0.1:${porta}`,
        tokenInterno: 'token-ia-teste'
      });

      const res = await client.detectarCandidatos({
        medicoId: 'med-1',
        dadosMedico: { nome: 'Dr. Lucas', cpfCnpj: '123' },
        conversa: {
          conversaId: 'conv-1',
          contatoTelefone: '5511999998888',
          mensagens: []
        }
      });

      assert.equal(res.sucesso, true);
      if (res.sucesso) {
        assert.equal(res.candidatoDetectado, true);
        assert.ok(res.perguntaSugeridaMedico?.includes('Mariana'));
      }
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('deve chamar /v1/analise/autocorrigir-falha e receber plano de autocorreção', async () => {
    const app = express();
    app.use(express.json());

    app.post('/v1/analise/autocorrigir-falha', (req, res) => {
      res.json({
        sucesso: true,
        diagnostico: 'conflito_regime_tributario_mei',
        podeCorrigirAutonomamente: true,
        acaoRecomendada: {
          tipo: 'atualizar_parametro_fiscal_e_reemitir',
          alteracoesParametros: { regimeTributario: 'simples_nacional_microempresa' }
        },
        explicacaoTecnica: 'Ajustado MEI para ME.'
      });
    });

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      const client = new IaClient({
        baseUrl: `http://127.0.0.1:${porta}`,
        tokenInterno: 'token-ia-teste'
      });

      const res = await client.autocorrigirFalha({
        medicoId: 'med-1',
        pedidoId: 'ped-1',
        erroSefin: { codigo: 'E172', mensagem: 'Erro MEI' },
        dadosNota: {},
        parametrosAtuais: {}
      });

      assert.equal(res.sucesso, true);
      if (res.sucesso) {
        assert.equal(res.podeCorrigirAutonomamente, true);
        assert.equal(res.diagnostico, 'conflito_regime_tributario_mei');
      }
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
