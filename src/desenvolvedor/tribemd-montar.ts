import type { Express } from 'express';
import { criarAreaTesteTribemd } from './tribemd-teste-router.js';
import { validarConfiguracaoTesteTribemd, type PendenciaTesteTribemd } from './tribemd-configuracao.js';

export const caminhoTesteTribemd = '/desenvolvedor/tribemd';

/** Montar antes dos parsers gerais: credenciais não entram no rawBody do Noto. */
export function montarAreaTesteTribemd(app: Express, env: NodeJS.ProcessEnv = process.env) {
  const desativado = { encerrar: async () => {} };
  if (env.TRIBEMD_TESTE_ATIVO !== 'true') {
    app.use(caminhoTesteTribemd, (_req, res) => res.status(404).json({ ok: false, codigo: 'AREA_DESATIVADA' }));
    return desativado;
  }
  const indisponivel = (pendencias: PendenciaTesteTribemd[]) => {
    app.use(caminhoTesteTribemd, (_req, res) => res.status(503).set('Cache-Control', 'no-store').json({
      ok: false, codigo: 'TRIBEMD_TESTE_NAO_CONFIGURADO',
      detalhe: 'Corrija as variáveis indicadas em pendencias e reimplante o serviço.',
      pendencias,
    }));
    return desativado;
  };
  const validacao = validarConfiguracaoTesteTribemd(env);
  if (!validacao.ok) return indisponivel(validacao.pendencias);
  try {
    const area = criarAreaTesteTribemd(validacao.config);
    app.use(caminhoTesteTribemd, area.app);
    return area;
  } catch {
    // Nenhuma mensagem bruta de exceção ou valor do ambiente é publicado.
    return indisponivel([{ variavel: 'INICIALIZACAO', motivo: 'Falha interna ao iniciar a área após validar a configuração. Consulte a equipe técnica.' }]);
  }
}
