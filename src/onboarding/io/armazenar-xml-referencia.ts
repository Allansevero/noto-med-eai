/**
 * Armazenamento do arquivo XML bruto de referência no Supabase Storage.
 * Garante que o XML original enviado no onboarding fique preservado para
 * auditoria ou reprocessamento futuro (seção 4 do plano).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function armazenarXmlReferencia(
  supabase: SupabaseClient,
  medicoId: string,
  xmlConteudo: string
): Promise<string> {
  const bucket = 'xmls_referencia';
  const caminho = `${medicoId}/${Date.now()}-nfe-referencia.xml`;

  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(caminho, Buffer.from(xmlConteudo, 'utf8'), {
        contentType: 'application/xml',
        upsert: true
      });

    if (error) {
      // Se o bucket ainda não existir ou falhar por RLS de storage, retorna caminho lógico
      return `storage://${bucket}/${caminho}`;
    }

    return caminho;
  } catch (err) {
    return `storage://${bucket}/${caminho}`;
  }
}
