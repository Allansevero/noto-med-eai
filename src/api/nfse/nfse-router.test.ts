/**
 * Testes de integração do Router da API pública de NFS-e.
 * Valida formatos de autenticação (Basic Auth, Bearer, Query Param), rotas de emissão e consulta,
 * e a formatação interoperável com clientes da Focus NFe.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { criarRouterNfse } from './nfse-router.js';
import type {
  EmissaoApiRepositorio,
  SolicitacaoRefRegistro,
  PerfilFiscalMedicoRegistro
} from './emissao-api-repositorio.js';

class RepositorioMock implements EmissaoApiRepositorio {
  public registros = new Map<string, SolicitacaoRefRegistro>();
  public perfil: PerfilFiscalMedicoRegistro = {
    medicoId: 'med-123',
    nomeCompleto: 'Dr. Roberto Lima',
    ctribNacPadrao: '040101',
    configuracaoCompleta: true
  };

  async buscarPorReferencia(medicoId: string, ref: string): Promise<SolicitacaoRefRegistro | null> {
    return this.registros.get(`${medicoId}:${ref}`) ?? null;
  }

  async buscarPerfilFiscalMedico(_medicoId: string): Promise<PerfilFiscalMedicoRegistro | null> {
    return this.perfil;
  }

  async buscarOuCriarPaciente(): Promise<{ id: string }> {
    return { id: 'pac-1' };
  }

  async enfileirarSolicitacao(params: any): Promise<{ id: string }> {
    const registro: SolicitacaoRefRegistro = {
      id: 'sol-novo',
      medicoId: params.medicoId,
      referenciaExterna: params.ref,
      status: 'pronta',
      fila: 'pronta',
      criadoEm: new Date(),
      notaFiscal: null
    };
    this.registros.set(`${params.medicoId}:${params.ref}`, registro);
    return { id: 'sol-novo' };
  }
}

async function subirServidorTeste(repo: RepositorioMock) {
  const app = express();
  app.use(express.json());

  const router = criarRouterNfse({
    repositorio: repo,
    autenticar: async token => (token === 'token-valido' ? 'med-123' : null)
  });

  app.use('/v2/nfse', router);
  app.use('/api/v1/nfse', router);

  const server = createServer(app);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  const porta = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${porta}`;

  return {
    baseUrl,
    fechar: () => new Promise<void>(resolve => server.close(() => resolve()))
  };
}

describe('NfseRouter', () => {
  it('deve rejeitar requisição sem autenticação com HTTP 401', async () => {
    const repo = new RepositorioMock();
    const { baseUrl, fechar } = await subirServidorTeste(repo);

    try {
      const res = await fetch(`${baseUrl}/v2/nfse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: 250, paciente: { cpf: '04457117013', nome: 'Carlos' } })
      });
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.strictEqual(json.codigo, 'nao_autorizado');
    } finally {
      await fechar();
    }
  });

  it('deve aceitar Basic Auth no formato Focus NFe e emitir com ref no query param', async () => {
    const repo = new RepositorioMock();
    const { baseUrl, fechar } = await subirServidorTeste(repo);

    try {
      const basicAuth = Buffer.from('token-valido:').toString('base64');
      const res = await fetch(`${baseUrl}/v2/nfse?ref=PED-999`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${basicAuth}`
        },
        body: JSON.stringify({
          valor: 350.5,
          paciente: {
            cpf: '044.571.170-13',
            nome: 'Ana Maria da Silva'
          }
        })
      });

      assert.strictEqual(res.status, 201);
      const json = await res.json();
      assert.strictEqual(json.status, 'processando_autorizacao');
      assert.strictEqual(json.referencia, 'PED-999');
      assert.strictEqual(json.ref, 'PED-999');
      assert.ok(json.solicitacao_id);
      assert.ok(json.solicitacaoId);
    } finally {
      await fechar();
    }
  });

  it('deve consultar NFS-e por ref e retornar status autorizado com chaves Focus NFe', async () => {
    const repo = new RepositorioMock();
    repo.registros.set('med-123:PED-100', {
      id: 'sol-100',
      medicoId: 'med-123',
      referenciaExterna: 'PED-100',
      status: 'emitida',
      fila: null,
      criadoEm: new Date('2026-10-13T10:00:00Z'),
      notaFiscal: {
        chaveAcesso: '43261012345678000199550000000000011000000010',
        ndps: 456,
        serie: '1',
        dataEmissao: new Date('2026-10-13T10:05:00Z'),
        xmlStoragePath: 'storage/xml/456.xml',
        pdfStoragePath: 'storage/pdf/456.pdf'
      }
    });

    const { baseUrl, fechar } = await subirServidorTeste(repo);

    try {
      const res = await fetch(`${baseUrl}/v2/nfse/PED-100?token=token-valido`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();

      assert.strictEqual(json.status, 'autorizado');
      assert.strictEqual(json.chave_acesso, '43261012345678000199550000000000011000000010');
      assert.strictEqual(json.chaveAcesso, '43261012345678000199550000000000011000000010');
      assert.strictEqual(json.numero, '456');
      assert.strictEqual(json.ndps, 456);
      assert.strictEqual(json.caminho_danfse, 'storage/pdf/456.pdf');
      assert.strictEqual(json.url_danfse, 'storage/pdf/456.pdf');
    } finally {
      await fechar();
    }
  });

  it('deve retornar HTTP 404 para referência inexistente', async () => {
    const repo = new RepositorioMock();
    const { baseUrl, fechar } = await subirServidorTeste(repo);

    try {
      const res = await fetch(`${baseUrl}/v2/nfse/NAO-EXISTE?token=token-valido`);
      assert.strictEqual(res.status, 404);
      const json = await res.json();
      assert.strictEqual(json.codigo, 'nao_encontrado');
    } finally {
      await fechar();
    }
  });
});
