/**
 * Testes unitários para o motor de emissão fiscal idempotente.
 * Garante que retentativas com o mesmo pedidoId não retransmitem nem duplicam a nota.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EmissorIdempotenteService,
  type EmissaoRepositorio,
  type RegistroNotaSalva,
  type TransmissorSerproPort
} from './emissor-idempotente.js';

describe('EmissorIdempotenteService em /fiscal', () => {
  function criarMocks() {
    const registros = new Map<string, RegistroNotaSalva>();
    let chamadasTransmissao = 0;

    const repositorio: EmissaoRepositorio = {
      async buscarPorPedidoId(id) {
        return registros.get(id) || null;
      },
      async salvar(registro) {
        registros.set(registro.pedidoId, registro);
      },
      async obterProximoNumeroDps() {
        return 101;
      }
    };

    const transmissor: TransmissorSerproPort = {
      async transmitir() {
        chamadasTransmissao += 1;
        return {
          sucesso: true,
          chaveAcesso: '35261012345678000195000000000000000000000101',
          numeroNota: '101'
        };
      }
    };

    return {
      repositorio,
      transmissor,
      obterChamadas: () => chamadasTransmissao
    };
  }

  it('deve emitir com sucesso na primeira chamada', async () => {
    const { repositorio, transmissor, obterChamadas } = criarMocks();
    const service = new EmissorIdempotenteService(repositorio, transmissor);

    const res = await service.emitir({
      pedidoId: 'ped-1',
      medicoId: 'med-1',
      tomador: { cpfCnpj: '12345678901', nome: 'Paciente Teste' },
      servico: { valorCentavos: 50000, dataCompetencia: '2026-10-15', discriminacao: 'Consulta' }
    });

    assert.equal(res.sucesso, true);
    if (res.sucesso) {
      assert.equal(res.status, 'autorizada');
      assert.equal(res.numeroNota, '101');
    }
    assert.equal(obterChamadas(), 1);
  });

  it('deve retornar resultado em cache na segunda chamada sem retransmitir (idempotência)', async () => {
    const { repositorio, transmissor, obterChamadas } = criarMocks();
    const service = new EmissorIdempotenteService(repositorio, transmissor);

    const req = {
      pedidoId: 'ped-idempotente',
      medicoId: 'med-1',
      tomador: { cpfCnpj: '12345678901', nome: 'Paciente Teste' },
      servico: { valorCentavos: 50000, dataCompetencia: '2026-10-15', discriminacao: 'Consulta' }
    };

    const res1 = await service.emitir(req);
    const res2 = await service.emitir(req);

    assert.equal(res1.sucesso, true);
    assert.equal(res2.sucesso, true);
    if (res1.sucesso && res2.sucesso) {
      assert.equal(res1.chaveAcesso, res2.chaveAcesso);
    }
    // Apenas 1 transmissão deve ter ocorrido
    assert.equal(obterChamadas(), 1);
  });
});
