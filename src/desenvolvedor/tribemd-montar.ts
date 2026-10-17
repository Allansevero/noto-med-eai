import type { Express } from 'express';
import { criarAreaTesteTribemd } from './tribemd-teste-router.js';

export const caminhoTesteTribemd = '/desenvolvedor/tribemd';

/** Montar antes dos parsers gerais: credenciais não entram no rawBody do Noto. */
export function montarAreaTesteTribemd(app: Express, env: NodeJS.ProcessEnv = process.env) {
  const desativado = { encerrar: async () => {} };
  if (env.TRIBEMD_TESTE_ATIVO !== 'true') {
    app.use(caminhoTesteTribemd, (_req, res) => res.status(404).json({ ok: false, codigo: 'AREA_DESATIVADA' }));
    return desativado;
  }
  try {
    const obrigatoria = (nome: string) => {
      const valor = env[nome];
      if (!valor) throw Error('CONFIGURACAO_AUSENTE');
      return valor;
    };
    const area = criarAreaTesteTribemd({
      token: obrigatoria('TRIBEMD_TESTE_TOKEN'),
      chave: obrigatoria('TRIBEMD_TESTE_CHAVE'),
      diretorio: obrigatoria('TRIBEMD_TESTE_DIRETORIO'),
      origem: obrigatoria('TRIBEMD_TESTE_ORIGEM'),
      chromium: env.CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium-browser',
      xvfb: env.XVFB_EXECUTABLE_PATH,
    });
    app.use(caminhoTesteTribemd, area.app);
    return area;
  } catch {
    // Configuração inválida fecha somente a área de teste, sem derrubar o Noto.
    app.use(caminhoTesteTribemd, (_req, res) => res.status(503).set('Cache-Control', 'no-store').json({
      ok: false, codigo: 'TRIBEMD_TESTE_NAO_CONFIGURADO',
      detalhe: 'Revise as variáveis TRIBEMD_TESTE_* do serviço.',
    }));
    return desativado;
  }
}
