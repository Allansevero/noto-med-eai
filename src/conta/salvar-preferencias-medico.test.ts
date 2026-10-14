/**
 * Testes unitários para o módulo salvar-preferencias-medico.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { salvarPreferenciasMedico } from './salvar-preferencias-medico.js';

describe('salvarPreferenciasMedico', () => {
  it('deve atualizar e retornar a preferência ativa', async () => {
    const fakePool: any = {
      async query(sql: string, params: any[]) {
        assert.ok(sql.includes('update medicos'));
        assert.equal(params[0], true);
        assert.equal(params[1], 'med-123');
        return {
          rows: [{ id: 'med-123', solicitar_cpf_direto_paciente: true }]
        };
      }
    };

    const res = await salvarPreferenciasMedico(fakePool, {
      medicoId: 'med-123',
      solicitarCpfDiretoPaciente: true
    });

    assert.equal(res.medicoId, 'med-123');
    assert.equal(res.solicitarCpfDiretoPaciente, true);
  });

  it('deve atualizar e retornar a preferência desativada (padrão)', async () => {
    const fakePool: any = {
      async query(_sql: string, params: any[]) {
        assert.equal(params[0], false);
        return {
          rows: [{ id: 'med-123', solicitar_cpf_direto_paciente: false }]
        };
      }
    };

    const res = await salvarPreferenciasMedico(fakePool, {
      medicoId: 'med-123',
      solicitarCpfDiretoPaciente: false
    });

    assert.equal(res.solicitarCpfDiretoPaciente, false);
  });

  it('deve lançar erro se médicoId não for informado', async () => {
    const fakePool: any = {};
    await assert.rejects(
      async () => {
        await salvarPreferenciasMedico(fakePool, {
          medicoId: '',
          solicitarCpfDiretoPaciente: true
        });
      },
      /Médico não informado/
    );
  });
});
