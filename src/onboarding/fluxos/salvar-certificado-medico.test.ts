import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { salvarCertificadoMedico } from './salvar-certificado-medico.js';

function criarSupabaseMock(erroUpload: { message: string } | null = null) {
  const removidos: string[][] = [];
  return {
    removidos,
    cliente: {
      storage: {
        from: () => ({
          upload: async () => ({ data: erroUpload ? null : { path: 'cert.pfx' }, error: erroUpload }),
          remove: async (paths: string[]) => {
            removidos.push(paths);
            return { data: null, error: null };
          }
        })
      }
    } as any
  };
}

describe('salvarCertificadoMedico', () => {
  it('deve armazenar a senha pela funcao oficial do Vault e ativar o certificado', async () => {
    const executedQueries: Array<{ sql: string; values?: any[] }> = [];
    const client = {
      query: async (sql: string, values?: any[]) => {
        executedQueries.push({ sql, values });
        if (sql.includes('vault.create_secret')) return { rows: [{ id: 'secret-123' }] };
        if (sql.includes('insert into medico_certificados')) {
          return { rows: [{ id: 'cert-123', valido_ate: '2027-09-26' }] };
        }
        return { rows: [] };
      },
      release: () => undefined
    };
    const mockPool = { connect: async () => client } as any;
    const supabase = criarSupabaseMock();

    const res = await salvarCertificadoMedico(mockPool, supabase.cliente, {
      medicoId: 'medico-uuid',
      arquivoBuffer: Buffer.from('dummy-pfx-data'),
      nomeArquivoOriginal: 'certificado.pfx',
      senhaCertificado: '123456'
    });

    assert.equal(res.ok, true);
    assert.equal(res.certificadoId, 'cert-123');
    assert.ok(res.storagePath.includes('medico-uuid'));
    assert.ok(executedQueries.some(({ sql }) => sql.includes('vault.create_secret')));
    const insert = executedQueries.find(({ sql }) => sql.includes('insert into medico_certificados'));
    assert.equal(insert?.values?.[3], 'secret-123');
    assert.ok(executedQueries.some(({ sql }) => sql === 'commit'));
  });

  it('nao deve ativar o certificado quando o Vault falhar', async () => {
    const executedQueries: string[] = [];
    const client = {
      query: async (sql: string) => {
        executedQueries.push(sql);
        if (sql.includes('vault.create_secret')) throw new Error('vault indisponivel');
        return { rows: [] };
      },
      release: () => undefined
    };
    const supabase = criarSupabaseMock();

    await assert.rejects(
      () => salvarCertificadoMedico({ connect: async () => client } as any, supabase.cliente, {
        medicoId: 'medico-uuid',
        arquivoBuffer: Buffer.from('dummy-pfx-data'),
        nomeArquivoOriginal: 'certificado.pfx',
        senhaCertificado: '123456'
      }),
      /vault indisponivel/
    );

    assert.equal(executedQueries.some((sql) => sql.includes('insert into medico_certificados')), false);
    assert.ok(executedQueries.includes('rollback'));
    assert.equal(supabase.removidos.length, 1);
  });

  it('deve interromper quando o Storage rejeitar o arquivo', async () => {
    const supabase = criarSupabaseMock({ message: 'bucket indisponivel' });
    let conectou = false;

    await assert.rejects(
      () => salvarCertificadoMedico({ connect: async () => { conectou = true; } } as any, supabase.cliente, {
        medicoId: 'medico-uuid',
        arquivoBuffer: Buffer.from('dummy-pfx-data'),
        nomeArquivoOriginal: 'certificado.pfx',
        senhaCertificado: '123456'
      }),
      /Falha ao armazenar/
    );
    assert.equal(conectou, false);
  });
});
