import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { salvarCertificadoMedico } from './salvar-certificado-medico.js';

describe('salvarCertificadoMedico', () => {
  it('deve armazenar certificado e gerar registro ativo', async () => {
    const executedQueries: any[] = [];
    const mockPool = {
      query: async (sql: string, values: any[]) => {
        executedQueries.push({ sql, values });
        if (sql.includes('medico_certificados')) {
          return { rows: [{ id: 'cert-123', valido_ate: '2027-09-26' }] };
        }
        return { rows: [{ id: 'secret-123' }] };
      }
    } as any;

    const mockSupabase = {
      storage: {
        from: () => ({
          upload: async () => ({ data: { path: 'cert.pfx' }, error: null })
        })
      }
    } as any;

    const res = await salvarCertificadoMedico(mockPool, mockSupabase, {
      medicoId: 'medico-uuid',
      arquivoBuffer: Buffer.from('dummy-pfx-data'),
      nomeArquivoOriginal: 'certificado.pfx',
      senhaCertificado: '123456'
    });

    assert.equal(res.ok, true);
    assert.equal(res.certificadoId, 'cert-123');
    assert.ok(res.storagePath.includes('medico-uuid'));
  });
});
