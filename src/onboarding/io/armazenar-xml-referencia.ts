/** Preserva o XML original em bucket privado antes de atualizar o perfil fiscal. */
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const BUCKET = 'xmls_referencia';
type EtapaStorage = 'upload' | 'criacao_bucket';
type ErroStorage = { message?: string; statusCode?: string | number; status?: number };
const bucketAusente = (erro: ErroStorage | null) => /bucket.*not found/i.test(erro?.message || '');

export class ErroPreservacaoXml extends Error {
  readonly codigo: string;
  readonly diagnostico: { bucket: string; etapa: EtapaStorage; statusHttp: number | null };
  constructor(erro: ErroStorage | null, etapa: EtapaStorage) {
    super('Não foi possível preservar o XML de referência. A configuração fiscal não foi atualizada.');
    this.name = 'ErroPreservacaoXml';
    const status = Number(erro?.statusCode ?? erro?.status);
    const mensagem = erro?.message || '';
    this.codigo = status === 401 || status === 403 || /permission|unauthorized|row.level security/i.test(mensagem)
      ? 'STORAGE_ACESSO_NEGADO'
      : bucketAusente(erro) ? 'STORAGE_BUCKET_AUSENTE'
      : /mime|content.type/i.test(mensagem) ? 'STORAGE_MIME_NAO_PERMITIDO'
      : status === 413 ? 'STORAGE_LIMITE_TAMANHO'
      : 'STORAGE_FALHOU';
    // Não inclui mensagem bruta, caminho, XML, credenciais ou identificadores pessoais.
    this.diagnostico = { bucket: BUCKET, etapa,
      statusHttp: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null };
  }
}

export async function armazenarXmlReferencia(
  supabase: SupabaseClient,
  medicoId: string,
  xmlConteudo: string
): Promise<string> {
  const caminho = `${medicoId}/${randomUUID()}-nfe-referencia.xml`;
  let etapa: EtapaStorage = 'upload';
  try {
    const enviar = () => supabase.storage.from(BUCKET).upload(caminho,
      Buffer.from(xmlConteudo, 'utf8'), { contentType: 'application/xml', upsert: false });
    let resultado = await enviar();
    if (bucketAusente(resultado.error)) {
      etapa = 'criacao_bucket';
      const criacao = await supabase.storage.createBucket(BUCKET, {
        public: false, fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ['application/xml', 'text/xml']
      });
      if (criacao.error && Number(criacao.error.statusCode) !== 409 &&
        !/already exists|duplicate/i.test(criacao.error.message)) {
        throw new ErroPreservacaoXml(criacao.error, etapa);
      }
      etapa = 'upload';
      resultado = await enviar();
    }
    if (resultado.error) throw new ErroPreservacaoXml(resultado.error, etapa);
    return caminho;
  } catch (erro) {
    if (erro instanceof ErroPreservacaoXml) throw erro;
    throw new ErroPreservacaoXml(erro as ErroStorage, etapa);
  }
}
