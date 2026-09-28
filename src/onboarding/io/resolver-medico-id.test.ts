/**
 * Testes unitários para resolver-medico-id.ts.
 * Valida a resolução transparente de IDs de médicos e usuários para garantir
 * integridade referencial nas tabelas fiscais e certificados.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolverMedicoId } from './resolver-medico-id.js';

describe('resolverMedicoId', () => {
  it('retorna o próprio ID quando ele já existe na tabela medicos', async () => {
    const poolFalso: any = {
      query: async (sql: string, params: any[]) => {
        if (sql.includes('from medicos where id = $1')) {
          return { rows: [{ id: 'medico-uuid-123' }] };
        }
        return { rows: [] };
      }
    };

    const id = await resolverMedicoId(poolFalso, 'medico-uuid-123');
    assert.equal(id, 'medico-uuid-123');
  });

  it('retorna medicos.id quando o parâmetro informado é um usuarios.id existente', async () => {
    const poolFalso: any = {
      query: async (sql: string, params: any[]) => {
        if (sql.includes('from medicos where id = $1')) {
          return { rows: [] };
        }
        if (sql.includes('from medicos where usuario_id = $1')) {
          return { rows: [{ id: 'medico-do-usuario-456' }] };
        }
        return { rows: [] };
      }
    };

    const id = await resolverMedicoId(poolFalso, 'usuario-uuid-456');
    assert.equal(id, 'medico-do-usuario-456');
  });

  it('cria automaticamente o registro em medicos se o usuario existe mas não tem médico', async () => {
    let inseriuMedico = false;
    const poolFalso: any = {
      query: async (sql: string, params: any[]) => {
        if (sql.includes('from medicos where id = $1') || sql.includes('from medicos where usuario_id = $1')) {
          return { rows: [] };
        }
        if (sql.includes('from usuarios where id = $1')) {
          return {
            rows: [
              {
                id: 'usuario-sem-medico',
                conta_id: 'conta-uuid-999',
                nome: 'Dr. Roberto Santos'
              }
            ]
          };
        }
        if (sql.includes('insert into medicos')) {
          inseriuMedico = true;
          assert.equal(params[0], 'usuario-sem-medico');
          assert.equal(params[1], 'conta-uuid-999');
          assert.equal(params[2], 'Dr. Roberto Santos');
          return { rows: [{ id: 'novo-medico-criado' }] };
        }
        return { rows: [] };
      }
    };

    const id = await resolverMedicoId(poolFalso, 'usuario-sem-medico');
    assert.equal(id, 'novo-medico-criado');
    assert.equal(inseriuMedico, true);
  });

  it('lança erro se o identificador não for encontrado em medicos nem em usuarios', async () => {
    const poolFalso: any = {
      query: async () => ({ rows: [] })
    };

    await assert.rejects(
      async () => resolverMedicoId(poolFalso, 'uuid-fantasma'),
      /Médico não encontrado para o identificador "uuid-fantasma"/
    );
  });

  it('lança erro se o identificador for vazio ou inválido', async () => {
    const poolFalso: any = { query: async () => ({ rows: [] }) };
    await assert.rejects(
      async () => resolverMedicoId(poolFalso, ''),
      /Identificador de médico ou usuário não fornecido/
    );
  });
});
