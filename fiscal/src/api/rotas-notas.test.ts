/**
 * Testes unitários para as rotas de emissão e PDF do serviço /fiscal.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { criarRouterNotas } from './rotas-notas.js';
import {
  EmissorIdempotenteService,
  type EmissaoRepositorio,
  type RegistroNotaSalva
} from '../emissao/emissor-idempotente.js';

describe('Router de Notas em /fiscal', () => {
  it('deve emitir com sucesso e retornar 200 com status autorizada', async () => {
    const registros = new Map<string, RegistroNotaSalva>();

    const repositorio: EmissaoRepositorio = {
      async buscarPorPedidoId(id) {
        return registros.get(id) || null;
      },
      async salvar(reg) {
        registros.set(reg.pedidoId, reg);
      },
      async obterProximoNumeroDps() {
        return 101;
      }
    };

    const transmissor = {
      async transmitir() {
        return {
          sucesso: true,
          chaveAcesso: '35261012345678000195000000000000000000000101',
          numeroNota: '101'
        };
      }
    };

    const service = new EmissorIdempotenteService(repositorio, transmissor);
    const app = express();
    app.use(express.json());
    app.use('/v1', criarRouterNotas(service, repositorio));

    const server = app.listen(0);
    const porta = (server.address() as any).port;

    try {
      const resp = await fetch(`http://127.0.0.1:${porta}/v1/notas/emitir`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pedidoId: 'ped-teste-api',
          medicoId: 'med-1',
          tomador: { cpfCnpj: '12345678901', nome: 'Paciente Teste' },
          servico: { valorCentavos: 45000, dataCompetencia: '2026-10-15', discriminacao: 'Consulta' }
        })
      });

      const body = await resp.json() as any;

      assert.equal(resp.status, 200);
      assert.equal(body.sucesso, true);
      assert.equal(body.numeroNota, '101');
      assert.equal(body.status, 'autorizada');

      // Testar streaming de PDF
      const respPdf = await fetch(`http://127.0.0.1:${porta}/v1/notas/ped-teste-api/pdf`);
      assert.equal(respPdf.status, 200);
      assert.equal(respPdf.headers.get('content-type'), 'application/pdf');
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });
});
