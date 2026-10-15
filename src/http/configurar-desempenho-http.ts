/**
 * Ajustes de desempenho do Express (compressão e cache de estáticos) fora do
 * `server.ts`, que já concentra rotas demais e puxa banco/config na importação.
 * Aqui nada lê ambiente: o app é recebido pronto, o que deixa testar com
 * um Express vazio.
 */

import compression from 'compression';
import type { Express } from 'express';

/** index.html (~140 KB) e o JSON da API trafegavam sem compressão; gzip reduz ~80%. */
const TAMANHO_MINIMO_COMPRESSAO_BYTES = 1024;

/** A fonte em /assets quase nunca muda; sem isso o navegador a rebaixa (~460 KB) a cada visita. */
export const OPCOES_ARQUIVOS_ESTATICOS = { maxAge: '7d' } as const;

export function configurarDesempenhoHttp(app: Express): void {
  app.disable('x-powered-by');
  app.use(compression({ threshold: TAMANHO_MINIMO_COMPRESSAO_BYTES }));
}
