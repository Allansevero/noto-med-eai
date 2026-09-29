/**
 * Armazenamento e ativação do certificado digital A1 (.pfx/.p12) do médico.
 * O arquivo binário é armazenado no bucket privado do Supabase Storage e
 * a senha é gravada no Supabase Vault,
 * mantendo apenas o UUID do segredo em `medico_certificados` (seção 1 e 4 do plano).
 */

import crypto from 'node:crypto';
import type pg from 'pg';
import type { SupabaseClient } from '@supabase/supabase-js';

export type SalvarCertificadoInput = {
  medicoId: string;
  arquivoBuffer: Buffer;
  nomeArquivoOriginal: string;
  senhaCertificado: string;
};

export type ResultadoSalvarCertificado = {
  ok: boolean;
  certificadoId: string;
  storagePath: string;
  validoAte: string;
};

const BUCKET_CERTIFICADOS = 'certificados';

async function enviarCertificadoAoStorage(
  supabase: SupabaseClient,
  storagePath: string,
  arquivoBuffer: Buffer
): Promise<void> {
  const enviar = () => supabase.storage
    .from(BUCKET_CERTIFICADOS)
    .upload(storagePath, arquivoBuffer, {
      contentType: 'application/x-pkcs12',
      upsert: true
    });

  let resultado = await enviar();
  if (resultado.error && /bucket not found/i.test(resultado.error.message)) {
    const criacao = await supabase.storage.createBucket(BUCKET_CERTIFICADOS, {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ['application/x-pkcs12', 'application/octet-stream']
    });
    if (criacao.error && !/already exists|duplicate/i.test(criacao.error.message)) {
      throw new Error(`Falha ao criar o armazenamento privado de certificados: ${criacao.error.message}`);
    }
    resultado = await enviar();
  }

  if (resultado.error) {
    throw new Error(`Falha ao armazenar o certificado A1: ${resultado.error.message}`);
  }
}

export async function salvarCertificadoMedico(
  pool: pg.Pool,
  supabase: SupabaseClient,
  input: SalvarCertificadoInput
): Promise<ResultadoSalvarCertificado> {
  const { medicoId, arquivoBuffer, senhaCertificado } = input;
  const certId = crypto.randomUUID();
  const storagePath = `certificados/${medicoId}/${certId}.pfx`;

  // 1. Armazena arquivo no Supabase Storage
  await enviarCertificadoAoStorage(supabase, storagePath, arquivoBuffer);

  // 2. Usa a funcao oficial do Vault. Nunca cria um registro ativo sem a senha.
  const client = await pool.connect();

  // 3. Define validade padrão de 1 ano para certificado A1 novo
  const dataHoje = new Date();
  const dataValidade = new Date();
  dataValidade.setFullYear(dataHoje.getFullYear() + 1);

  let res: { rows: Array<{ id: string; valido_ate: string }> };
  try {
    await client.query('begin');
    const resVault = await client.query(
      `select vault.create_secret($1, $2, $3) as id`,
      [
        senhaCertificado,
        `cert_medico_${medicoId}_${certId}`,
        'Senha do certificado digital A1'
      ]
    );
    const secretUuid = resVault.rows[0]?.id;
    if (!secretUuid) {
      throw new Error('O Vault nao retornou o identificador do segredo.');
    }

    // 3. Desativa certificados anteriores do mesmo medico.
    await client.query(
      `update medico_certificados set status = 'vencido' where medico_id = $1 and status = 'ativo'`,
      [medicoId]
    );

    // 4. Grava o novo certificado somente depois de confirmar o segredo.
    res = await client.query(
      `insert into medico_certificados (
        id, medico_id, arquivo_storage_path, senha_secret_id,
        valido_de, valido_ate, status
      ) values (
        $1, $2, $3, $4,
        $5, $6, 'ativo'
      )
      returning id, valido_ate`,
      [
        certId,
        medicoId,
        storagePath,
        secretUuid,
        dataHoje.toISOString().slice(0, 10),
        dataValidade.toISOString().slice(0, 10)
      ]
    );
    await client.query('commit');
  } catch (err) {
    await client.query('rollback').catch(() => undefined);
    await supabase.storage.from(BUCKET_CERTIFICADOS).remove([storagePath]).catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }

  return {
    ok: true,
    certificadoId: res.rows[0].id,
    storagePath,
    validoAte: res.rows[0].valido_ate
  };
}
