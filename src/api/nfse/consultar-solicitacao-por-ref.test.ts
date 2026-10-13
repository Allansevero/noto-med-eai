/**
 * Testes unitários do caso de uso de consulta de NFS-e por referência externa.
 * Valida os fluxos de sucesso (processando e autorizado), erros de autorização e 404.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { consultarSolicitacaoPorRef } from './consultar-solicitacao-por-ref.js';
import type {
  EmissaoApiRepositorio,
  SolicitacaoRefRegistro,
  PerfilFiscalMedicoRegistro
} from './emissao-api-repositorio.js';

class RepositorioMock implements EmissaoApiRepositorio {
  public registros = new Map<string, SolicitacaoRefRegistro>();

  async buscarPorReferencia(medicoId: string, ref: string): Promise<SolicitacaoRefRegistro | null> {
    const chave = `${medicoId}:${ref}`;
    return this.registros.get(chave) ?? null;
  }

  async buscarPerfilFiscalMedico(_medicoId: string): Promise<PerfilFiscalMedicoRegistro | null> {
    return null;
  }

  async buscarOuCriarPaciente(): Promise<{ id: string }> {
    return { id: 'pac-1' };
  }

  async enfileirarSolicitacao(): Promise<{ id: string }> {
    return { id: 'sol-1' };
  }
}

describe('consultarSolicitacaoPorRef', () => {
  it('deve rejeitar ref vazia ou ausente com HTTP 400', async () => {
    const repo = new RepositorioMock();
    const res = await consultarSolicitacaoPorRef({ medicoId: 'med-1', ref: '' }, repo);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.statusHttp, 400);
    assert.strictEqual(res.erro.codigo, 'parametro_invalido');
  });

  it('deve rejeitar medicoId ausente com HTTP 401', async () => {
    const repo = new RepositorioMock();
    const res = await consultarSolicitacaoPorRef({ medicoId: '', ref: 'REF-123' }, repo);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.statusHttp, 401);
    assert.strictEqual(res.erro.codigo, 'nao_autorizado');
  });

  it('deve retornar HTTP 404 se a referência não for encontrada', async () => {
    const repo = new RepositorioMock();
    const res = await consultarSolicitacaoPorRef({ medicoId: 'med-1', ref: 'REF-INEXISTENTE' }, repo);
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.statusHttp, 404);
    assert.strictEqual(res.erro.codigo, 'nao_encontrado');
  });

  it('deve retornar status processando_autorizacao para solicitação na fila', async () => {
    const repo = new RepositorioMock();
    repo.registros.set('med-1:REF-001', {
      id: 'sol-1',
      medicoId: 'med-1',
      referenciaExterna: 'REF-001',
      status: 'pronta',
      fila: 'pronta',
      criadoEm: new Date('2026-10-13T10:00:00Z'),
      notaFiscal: null
    });

    const res = await consultarSolicitacaoPorRef({ medicoId: 'med-1', ref: 'REF-001' }, repo);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.statusHttp, 200);
    assert.strictEqual(res.dados.status, 'processando_autorizacao');
    assert.strictEqual(res.dados.ref, 'REF-001');
  });

  it('deve retornar status autorizado com dados da nota fiscal emitida', async () => {
    const repo = new RepositorioMock();
    repo.registros.set('med-1:REF-002', {
      id: 'sol-2',
      medicoId: 'med-1',
      referenciaExterna: 'REF-002',
      status: 'emitida',
      fila: null,
      criadoEm: new Date('2026-10-13T10:00:00Z'),
      notaFiscal: {
        chaveAcesso: '43261012345678000199550000000000011000000010',
        ndps: 101,
        serie: '1',
        dataEmissao: new Date('2026-10-13T10:05:00Z'),
        xmlStoragePath: 'storage/xml/101.xml',
        pdfStoragePath: 'storage/pdf/101.pdf'
      }
    });

    const res = await consultarSolicitacaoPorRef({ medicoId: 'med-1', ref: 'REF-002' }, repo);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.statusHttp, 200);
    assert.strictEqual(res.dados.status, 'autorizado');
    if (res.dados.status === 'autorizado') {
      assert.strictEqual(res.dados.ndps, 101);
      assert.strictEqual(res.dados.chaveAcesso, '43261012345678000199550000000000011000000010');
      assert.strictEqual(res.dados.pdfStoragePath, 'storage/pdf/101.pdf');
    }
  });

  it('deve retornar status erro_autorizacao com detalhes do erro', async () => {
    const repo = new RepositorioMock();
    repo.registros.set('med-1:REF-003', {
      id: 'sol-3',
      medicoId: 'med-1',
      referenciaExterna: 'REF-003',
      status: 'erro',
      fila: null,
      erro: 'Inscrição Municipal inválida para o tomador',
      criadoEm: new Date('2026-10-13T10:00:00Z'),
      notaFiscal: null
    });

    const res = await consultarSolicitacaoPorRef({ medicoId: 'med-1', ref: 'REF-003' }, repo);
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.statusHttp, 200);
    assert.strictEqual(res.dados.status, 'erro_autorizacao');
    if (res.dados.status === 'erro_autorizacao') {
      assert.strictEqual(res.dados.erros.length, 1);
      assert.strictEqual(res.dados.erros[0]?.mensagem, 'Inscrição Municipal inválida para o tomador');
    }
  });
});
