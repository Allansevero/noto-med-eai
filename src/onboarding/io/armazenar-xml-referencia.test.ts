import { test } from 'node:test';
import assert from 'node:assert/strict';
import { armazenarXmlReferencia } from './armazenar-xml-referencia.js';

function storage(erros: any[] = [null], erroCriacao: any = null) {
  const objetos = new Map<string, Buffer>();
  const criacoes: Array<{ bucket: string; opcoes: any }> = [];
  let uploads = 0;
  return { objetos, criacoes, uploads: () => uploads, cliente: { storage: {
    async createBucket(bucket: string, opcoes: any) {
      criacoes.push({ bucket, opcoes });
      return { data: erroCriacao ? null : { name: bucket }, error: erroCriacao };
    },
    from(bucket: string) { return { async upload(path: string, bytes: Buffer, opcoes: any) {
      assert.equal(bucket, 'xmls_referencia');
      assert.equal(opcoes.contentType, 'application/xml');
      const erro = erros[Math.min(uploads++, erros.length - 1)];
      if (erro instanceof Error) throw erro;
      if (!erro) objetos.set(path, bytes);
      return { data: erro ? null : { path }, error: erro };
    } }; }
  } } as any };
}
const ausente = { message: 'Bucket not found', statusCode: '404' };
test('preserva XML integral e cria bucket privado somente quando ausente', async () => {
  const c = storage([ausente, null]);
  const caminho = await armazenarXmlReferencia(c.cliente, 'med', '<NFSe>original</NFSe>');
  assert.equal(c.objetos.get(caminho)?.toString(), '<NFSe>original</NFSe>');
  assert.equal(c.uploads(), 2);
  assert.equal(c.criacoes[0].bucket, 'xmls_referencia');
  assert.equal(c.criacoes[0].opcoes.public, false);
  assert.ok(c.criacoes[0].opcoes.allowedMimeTypes.includes('application/xml'));
});
test('bucket existente não é recriado nem tornado público', async () => {
  const c = storage();
  const caminho = await armazenarXmlReferencia(c.cliente, 'med', '<NFSe/>');
  assert.equal(c.objetos.get(caminho)?.toString(), '<NFSe/>');
  assert.equal(c.criacoes.length, 0);
  assert.equal(c.uploads(), 1);
});
test('criação concorrente permite apenas uma nova tentativa de preservar o XML', async () => {
  const c = storage([ausente, null], { message: 'The resource already exists', statusCode: '409' });
  const caminho = await armazenarXmlReferencia(c.cliente, 'med', '<NFSe/>');
  assert.ok(c.objetos.has(caminho));
  assert.equal(c.uploads(), 2);
});
test('negação de acesso e restrição de MIME são diagnosticadas sem expor conteúdo nem tentar contorná-las', async () => {
  for (const [erro, codigo] of [
    [{ statusCode: '403', message: 'permission denied CPF 12345678909' }, 'STORAGE_ACESSO_NEGADO'],
    [{ statusCode: '400', message: 'mime type application/xml is not supported CPF 12345678909' }, 'STORAGE_MIME_NAO_PERMITIDO']
  ] as const) {
    const c = storage([erro]);
    await assert.rejects(() => armazenarXmlReferencia(c.cliente, 'med', '<NFSe/>'), (falha: any) => {
      assert.equal(falha.codigo, codigo);
      assert.equal(falha.diagnostico.etapa, 'upload');
      assert.ok(!JSON.stringify(falha).includes('12345678909'));
      return true;
    });
    assert.equal(c.criacoes.length, 0);
    assert.equal(c.uploads(), 1);
  }
});
test('falha na criação informa a etapa e impede concluir o armazenamento', async () => {
  const c = storage([ausente], { statusCode: '403', message: 'permission denied' });
  await assert.rejects(() => armazenarXmlReferencia(c.cliente, 'med', '<NFSe/>'), (falha: any) => {
    assert.equal(falha.codigo, 'STORAGE_ACESSO_NEGADO');
    assert.equal(falha.diagnostico.etapa, 'criacao_bucket');
    return true;
  });
  assert.equal(c.uploads(), 1);
});
test('upload ainda falhando após criação não entra em loop', async () => {
  const c = storage([ausente]);
  await assert.rejects(() => armazenarXmlReferencia(c.cliente, 'med', '<NFSe/>'));
  assert.equal(c.uploads(), 2);
  assert.equal(c.criacoes.length, 1);
});
