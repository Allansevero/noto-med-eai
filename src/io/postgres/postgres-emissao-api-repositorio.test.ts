/**
 * Testes unitários do repositório PostgreSQL para a API de NFS-e.
 * Testa queries, mapeamento de registros, criptografia e transações com mock de pool.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PostgresEmissaoApiRepositorio } from './postgres-emissao-api-repositorio.js';

describe('PostgresEmissaoApiRepositorio', () => {
  const chaveCripto = 'chave-teste-32-chars-long-01234';
  const pepper = 'pepper-teste-12345';

  it('buscarPorReferencia retorna null se registro não existir', async () => {
    const pool: any = {
      query: async () => ({ rows: [] })
    };
    const repo = new PostgresEmissaoApiRepositorio(pool, chaveCripto, pepper);
    const res = await repo.buscarPorReferencia('med-1', 'REF-INEXISTENTE');
    assert.strictEqual(res, null);
  });

  it('buscarPorReferencia mapeia notaFiscal se autorizada', async () => {
    const pool: any = {
      query: async () => ({
        rows: [
          {
            id: 'sol-1',
            medico_id: 'med-1',
            referencia_externa: 'REF-001',
            status: 'emitida',
            fila: null,
            erro: null,
            criado_em: '2026-10-13T10:00:00Z',
            chave_acesso: '43261012345678000199550000000000011000000010',
            ndps: 105,
            serie: '1',
            data_emissao: '2026-10-13T10:05:00Z',
            xml_storage_path: 'storage/xml/105.xml',
            pdf_storage_path: 'storage/pdf/105.pdf'
          }
        ]
      })
    };
    const repo = new PostgresEmissaoApiRepositorio(pool, chaveCripto, pepper);
    const res = await repo.buscarPorReferencia('med-1', 'REF-001');

    assert.notStrictEqual(res, null);
    assert.strictEqual(res?.referenciaExterna, 'REF-001');
    assert.strictEqual(res?.notaFiscal?.ndps, 105);
    assert.strictEqual(res?.notaFiscal?.chaveAcesso, '43261012345678000199550000000000011000000010');
  });

  it('buscarPerfilFiscalMedico identifica configuracaoCompleta', async () => {
    const pool: any = {
      query: async () => ({
        rows: [
          {
            medico_id: 'med-1',
            nome_completo: 'Dr. Roberto Lima',
            especialidade: 'Ortopedia',
            crm: '12345',
            rqe: '6789',
            confirmado_pelo_medico: true,
            cclass_trib_padrao: '000001',
            cind_op_padrao: '1',
            ctrib_nac: '040101',
            cnbs: '1.01'
          }
        ]
      })
    };
    const repo = new PostgresEmissaoApiRepositorio(pool, chaveCripto, pepper);
    const res = await repo.buscarPerfilFiscalMedico('med-1');

    assert.notStrictEqual(res, null);
    assert.strictEqual(res?.configuracaoCompleta, true);
    assert.strictEqual(res?.ctribNacPadrao, '040101');
  });

  it('buscarOuCriarPaciente atualiza existente quando hash coincide', async () => {
    const queries: string[] = [];
    const pool: any = {
      query: async (sql: string) => {
        queries.push(sql);
        if (sql.includes('select id from pacientes')) {
          return { rows: [{ id: 'pac-existente' }] };
        }
        return { rows: [] };
      }
    };
    const repo = new PostgresEmissaoApiRepositorio(pool, chaveCripto, pepper);
    const res = await repo.buscarOuCriarPaciente('med-1', {
      cpfLimpo: '04457117013',
      nome: 'Carlos Silva'
    });

    assert.strictEqual(res.id, 'pac-existente');
    assert.ok(queries.some(q => q.includes('update pacientes')));
  });

  it('buscarOuCriarPaciente insere novo quando hash não existe', async () => {
    const pool: any = {
      query: async (sql: string) => {
        if (sql.includes('select id from pacientes')) {
          return { rows: [] };
        }
        if (sql.includes('insert into pacientes')) {
          return { rows: [{ id: 'pac-novo' }] };
        }
        return { rows: [] };
      }
    };
    const repo = new PostgresEmissaoApiRepositorio(pool, chaveCripto, pepper);
    const res = await repo.buscarOuCriarPaciente('med-1', {
      cpfLimpo: '04457117013',
      nome: 'Carlos Silva'
    });

    assert.strictEqual(res.id, 'pac-novo');
  });

  it('enfileirarSolicitacao executa transacao completa e retorna id', async () => {
    const comandos: string[] = [];
    const client = {
      query: async (sql: string) => {
        comandos.push(sql);
        if (sql.includes('insert into solicitacoes_nota')) {
          return { rows: [{ id: 'sol-criada' }] };
        }
        return { rows: [] };
      },
      release: () => {}
    };
    const pool: any = {
      connect: async () => client
    };
    const repo = new PostgresEmissaoApiRepositorio(pool, chaveCripto, pepper);
    const res = await repo.enfileirarSolicitacao({
      ref: 'REF-TESTE',
      medicoId: 'med-1',
      pacienteId: 'pac-1',
      valorServicoCentavos: 25000,
      xdescServ: 'Consulta Médica',
      ctribNac: '040101'
    });

    assert.strictEqual(res.id, 'sol-criada');
    assert.ok(comandos.includes('begin'));
    assert.ok(comandos.includes('commit'));
    assert.ok(comandos.some(c => c.includes('update solicitacoes_nota s set servico_fiscal_id')));
  });
});
