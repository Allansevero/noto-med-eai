import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const executar = promisify(execFile);
const MAX_IMAGEM_BYTES = 187_500;
export class MidiaFiscalNaoSuportada extends Error {}

/** Decode actual bytes; MIME labels and document names never establish format. */
export async function prepararMidiaFiscal(base64: string): Promise<{
  base64: string; mimeType: 'image/png' | 'image/jpeg'; documentoHash: string;
}> {
  const limpo = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s/g, '');
  if (!limpo || limpo.length > 14_000_000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(limpo)) {
    throw new MidiaFiscalNaoSuportada('midia_invalida_ou_grande');
  }
  const bytes = Buffer.from(limpo, 'base64');
  const documentoHash = createHash('sha256').update(bytes).digest('hex');
  const pdf = bytes.subarray(0, 5).toString() === '%PDF-';
  const png = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!pdf && !png && !jpeg) throw new MidiaFiscalNaoSuportada('imagem_formato_nao_suportado');
  if (!pdf && limpo.length <= 250_000) return { base64: limpo, mimeType: png ? 'image/png' : 'image/jpeg', documentoHash };
  const diretorio = await mkdtemp(join(tmpdir(), 'noto-fiscal-'));
  try {
    const arquivo = join(diretorio, pdf ? 'documento.pdf' : png ? 'imagem.png' : 'imagem.jpg');
    await writeFile(arquivo, bytes, { mode: 0o600 });
    if (pdf) {
      const info = await executar('pdfinfo', [arquivo], { timeout: 10_000, maxBuffer: 32_768 });
      // Multiple pages need human review until every page can be correlated safely.
      if (!/^Pages:\s+1\s*$/m.test(info.stdout)) throw new MidiaFiscalNaoSuportada('pdf_multiplas_paginas');
    }
    for (const tamanho of [1200, 1000, 800]) {
      const saida = join(diretorio, 'pagina.jpg');
      if (pdf) {
        await executar('pdftoppm', ['-f', '1', '-singlefile', '-scale-to', String(tamanho), '-jpeg', '-jpegopt', 'quality=65', arquivo, join(diretorio, 'pagina')], { timeout: 15_000, maxBuffer: 32_768 });
      } else {
        // Explicit raster decoder prevents filename/delegate format guessing. Resource
        // limits and the child timeout bound decompression and conversion work.
        await executar('convert', ['-limit', 'memory', '64MiB', '-limit', 'map', '64MiB', '-limit', 'disk', '0',
          '-limit', 'thread', '1', '-limit', 'time', '10', '-limit', 'width', '16000', '-limit', 'height', '16000',
          `${png ? 'png' : 'jpeg'}:${arquivo}[0]`, '-auto-orient', '-resize', `${tamanho}x${tamanho}>`,
          '-background', 'white', '-alpha', 'remove', '-strip', '-quality', '65', `jpeg:${saida}`],
        { timeout: 15_000, maxBuffer: 32_768, env: { ...process.env, MAGICK_TEMPORARY_PATH: diretorio } });
      }
      const imagem = await readFile(saida);
      if (imagem.length <= MAX_IMAGEM_BYTES) return { base64: imagem.toString('base64'), mimeType: 'image/jpeg', documentoHash };
    }
    throw new MidiaFiscalNaoSuportada('imagem_reduzida_ainda_grande');
  } catch (erro) {
    if (erro instanceof MidiaFiscalNaoSuportada) throw erro;
    throw new MidiaFiscalNaoSuportada(pdf ? 'pdf_renderizacao_indisponivel' : 'imagem_conversao_indisponivel');
  } finally {
    await rm(diretorio, { recursive: true, force: true });
  }
}
