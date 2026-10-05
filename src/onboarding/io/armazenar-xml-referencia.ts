/**
 * Armazenamento do arquivo XML bruto de referência no Supabase Storage.
 * Garante que o XML original enviado no onboarding fique preservado para
 * auditoria ou reprocessamento futuro (seção 4 do plano).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

export async function armazenarXmlReferencia(
  supabase: SupabaseClient,
  medicoId: string,
  xmlConteudo: string
): Promise<string> {
  const bucket = 'xmls_referencia';
  const caminho = `${medicoId}/${randomUUID()}-nfe-referencia.xml`;

  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(caminho, Buffer.from(xmlConteudo, 'utf8'), {
        contentType: 'application/xml',
        upsert: true
      });

    if (error) {
      throw new Error('Falha ao preservar o XML de referência no armazenamento.');
    }

    return caminho;
  } catch (err) {
    throw new Error('Não foi possível preservar o XML de referência. A configuração fiscal não foi atualizada.');
  }
}
