/**
 * Testes unitários para o fluxo de transmissão de NFS-e.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { transmitirNfse, type ProvedorEmissaoNfse } from './transmitir-nfse.js';
import { criarRastreadorLatencia } from '../regras/medir-etapas.js';

test('Transmissão NFS-e - Não chama o provedor emissor se a proteção fiscal recusar', async () => {
  let chamouApi = false;
  const provedorMock: ProvedorEmissaoNfse = {
    async emitir() {
      chamouApi = true;
      return { sucesso: true, numeroNota: '123' };
    }
  };

  const resposta = await transmitirNfse(
    {
      dadosValidacao: {
        identidadeMedicaConfirmada: false, // Bloqueio aqui
        statusCadastro: 'confirmado',
        medica: { nome: 'Dra. Luiza', crm: '9988', ufCrm: 'RJ' }
      },
      payloadNfse: { valor: 350 }
    },
    provedorMock
  );

  assert.equal(resposta.status, 'bloqueada_fiscal');
  assert.equal(chamouApi, false, 'API emissora jamais deve ser invocada com identidade pendente');
});

test('Transmissão NFS-e - Emite com sucesso e mede tempo das etapas', async () => {
  const provedorMock: ProvedorEmissaoNfse = {
    async emitir() {
      return { sucesso: true, numeroNota: 'NF-2026-001' };
    }
  };

  const rastreador = criarRastreadorLatencia();

  const resposta = await transmitirNfse(
    {
      dadosValidacao: {
        identidadeMedicaConfirmada: true,
        statusCadastro: 'confirmado',
        medica: { nome: 'Dra. Luiza', crm: '9988', ufCrm: 'RJ' }
      },
      payloadNfse: { valor: 500 },
      rastreador
    },
    provedorMock
  );

  assert.equal(resposta.status, 'emitida');
  if (resposta.status === 'emitida') {
    assert.equal(resposta.numeroNota, 'NF-2026-001');
  }

  const metricas = rastreador.obterMetricas();
  assert.equal(metricas.length, 2);
  assert.equal(metricas[0].etapa, 'validacao_protecao_fiscal');
  assert.equal(metricas[1].etapa, 'transmissao_api_nfse');
});
