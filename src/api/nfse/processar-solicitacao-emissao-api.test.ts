/**
 * Testes unitários para processarSolicitacaoEmissaoApi.
 * Valida garantia de idempotência, inferência Zero-Config e controle de status
 * com repositório falso em memória.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processarSolicitacaoEmissaoApi } from './processar-solicitacao-emissao-api.js';
import type {
  EmissaoApiRepositorio,
  SolicitacaoRefRegistro,
  PerfilFiscalMedicoRegistro,
  CriarSolicitacaoEmissaoParams
} from './emissao-api-repositorio.js';

class RepositorioFalso implements EmissaoApiRepositorio {
  solicitacoesPorRef = new Map<string, SolicitacaoRefRegistro>();
  perfilMedico: PerfilFiscalMedicoRegistro | null = {
    medicoId: 'med-123',
    nomeCompleto: 'Dra. Maria Silva',
    especialidade: 'Pediatria',
    crm: '12345/SP',
    rqe: null,
    ctribNacPadrao: '040301',
    cnbs: '1.0101.11.00',
    cclassTrib: '400001',
    cindOp: '020101',
    configuracaoCompleta: true
  };
  enfileiradas: CriarSolicitacaoEmissaoParams[] = [];

  async buscarPorReferencia(_medicoId: string, ref: string): Promise<SolicitacaoRefRegistro | null> {
    return this.solicitacoesPorRef.get(ref) || null;
  }

  async buscarPerfilFiscalMedico(_medicoId: string): Promise<PerfilFiscalMedicoRegistro | null> {
    return this.perfilMedico;
  }

  async buscarOuCriarPaciente(_medicoId: string, _paciente: any): Promise<{ id: string }> {
    return { id: 'pac-999' };
  }

  async enfileirarSolicitacao(params: CriarSolicitacaoEmissaoParams): Promise<{ id: string }> {
    this.enfileiradas.push(params);
    const id = `sol-${this.enfileiradas.length}`;
    this.solicitacoesPorRef.set(params.ref, {
      id,
      medicoId: params.medicoId,
      referenciaExterna: params.ref,
      status: 'pendente',
      fila: 'pronta',
      criadoEm: new Date()
    });
    return { id };
  }
}

describe('processarSolicitacaoEmissaoApi', () => {
  const payloadBase = {
    ref: 'atend_101',
    medicoId: 'med-123',
    valor: 250.00,
    paciente: {
      nome: 'João da Silva',
      cpf: '529.982.247-25'
    }
  };

  it('deve aceitar e enfileirar nova solicitação retornando HTTP 201 (processando_autorizacao)', async () => {
    const repo = new RepositorioFalso();
    const res = await processarSolicitacaoEmissaoApi(payloadBase, { repositorio: repo });

    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.statusHttp, 201);
      assert.strictEqual(res.resposta.status, 'processando_autorizacao');
      assert.strictEqual(res.resposta.ref, 'atend_101');
    }
    assert.strictEqual(repo.enfileiradas.length, 1);
    assert.strictEqual(repo.enfileiradas[0].valorServicoCentavos, 25000);
    assert.strictEqual(repo.enfileiradas[0].ctribNac, '040301');
  });

  it('deve garantir idempotência se a mesma referência for reenviada em processamento (retorna HTTP 200 sem duplicar)', async () => {
    const repo = new RepositorioFalso();
    await processarSolicitacaoEmissaoApi(payloadBase, { repositorio: repo });
    assert.strictEqual(repo.enfileiradas.length, 1);

    // Segundo envio com o mesmo ref
    const resDuplicado = await processarSolicitacaoEmissaoApi(payloadBase, { repositorio: repo });
    assert.strictEqual(resDuplicado.ok, true);
    if (resDuplicado.ok) {
      assert.strictEqual(resDuplicado.statusHttp, 200);
      assert.strictEqual(resDuplicado.resposta.status, 'processando_autorizacao');
    }
    // Não pode ter inserido novamente na fila
    assert.strictEqual(repo.enfileiradas.length, 1);
  });

  it('deve retornar a nota autorizada se a referência já foi autorizada previamente (HTTP 200 com autorizado)', async () => {
    const repo = new RepositorioFalso();
    repo.solicitacoesPorRef.set('atend_101', {
      id: 'sol-antiga',
      medicoId: 'med-123',
      referenciaExterna: 'atend_101',
      status: 'emitida',
      fila: null,
      criadoEm: new Date(),
      notaFiscal: {
        chaveAcesso: 'CHAVE123456789',
        ndps: 42,
        serie: '00001',
        dataEmissao: new Date('2026-03-01T10:00:00Z'),
        xmlStoragePath: '/xml/chave.xml',
        pdfStoragePath: '/pdf/chave.pdf'
      }
    });

    const res = await processarSolicitacaoEmissaoApi(payloadBase, { repositorio: repo });
    assert.strictEqual(res.ok, true);
    if (res.ok) {
      assert.strictEqual(res.statusHttp, 200);
      assert.strictEqual(res.resposta.status, 'autorizado');
      if (res.resposta.status === 'autorizado') {
        assert.strictEqual(res.resposta.chaveAcesso, 'CHAVE123456789');
        assert.strictEqual(res.resposta.ndps, 42);
      }
    }
  });

  it('deve recusar emissão com HTTP 422 se médico não possuir perfil fiscal completo', async () => {
    const repo = new RepositorioFalso();
    repo.perfilMedico = null;

    const res = await processarSolicitacaoEmissaoApi(payloadBase, { repositorio: repo });
    assert.strictEqual(res.ok, false);
    if (!res.ok) {
      assert.strictEqual(res.statusHttp, 422);
      assert.strictEqual(res.erro.codigo, 'perfil_fiscal_incompleto');
    }
  });
});
