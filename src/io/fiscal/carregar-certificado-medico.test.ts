import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { carregarCertificadoMedico } from './carregar-certificado-medico.js';

describe('carregarCertificadoMedico', () => {
  it('deve retornar null se médico não possuir certificado ativo', async () => {
    const fakePool: any = {
      async query() {
        return { rows: [] };
      }
    };
    const fakeSupabase: any = {};

    const res = await carregarCertificadoMedico(fakePool, fakeSupabase, 'medico-1');
    assert.equal(res, null);
  });

  it('deve carregar certificado e senha com sucesso quando existentes', async () => {
    const mockPfx = Buffer.from('conteudo-pfx-fake');
    const fakePool: any = {
      async query(sql: string) {
        if (sql.includes('medico_certificados')) {
          return {
            rows: [
              {
                id: 'cert-1',
                medico_id: 'medico-1',
                arquivo_storage_path: 'certificados/medico-1/cert-1.pfx',
                senha_secret_id: 'secret-1',
                valido_ate: '2027-01-01'
              }
            ]
          };
        }
        if (sql.includes('vault.decrypted_secrets')) {
          return { rows: [{ secret: 'senha123' }] };
        }
        return { rows: [] };
      }
    };

    const fakeSupabase: any = {
      storage: {
        from(bucket: string) {
          assert.equal(bucket, 'certificados');
          return {
            async download(path: string) {
              assert.equal(path, 'certificados/medico-1/cert-1.pfx');
              return {
                data: {
                  async arrayBuffer() {
                    const u8 = new Uint8Array(Buffer.from('conteudo-pfx-fake'));
                    return u8.buffer;
                  }
                },
                error: null
              };
            }
          };
        }
      }
    };

    const cert = await carregarCertificadoMedico(fakePool, fakeSupabase, 'medico-1');
    assert.ok(cert);
    assert.equal(cert.id, 'cert-1');
    assert.equal(cert.senhaCertificado, 'senha123');
    assert.equal(cert.arquivoStoragePath, 'certificados/medico-1/cert-1.pfx');
    assert.equal(cert.pfxBuffer.toString(), 'conteudo-pfx-fake');
  });

  it('deve lançar erro se a senha não puder ser obtida do vault', async () => {
    const fakePool: any = {
      async query(sql: string) {
        if (sql.includes('medico_certificados')) {
          return {
            rows: [
              {
                id: 'cert-1',
                medico_id: 'medico-1',
                arquivo_storage_path: 'path.pfx',
                senha_secret_id: 'secret-1',
                valido_ate: '2027-01-01'
              }
            ]
          };
        }
        return { rows: [] };
      }
    };
    const fakeSupabase: any = {};

    await assert.rejects(
      () => carregarCertificadoMedico(fakePool, fakeSupabase, 'medico-1'),
      /Senha do certificado não encontrada no Vault/
    );
  });
});
