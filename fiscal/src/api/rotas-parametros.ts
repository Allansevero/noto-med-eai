/**
 * Router para consulta e atualização de parâmetros fiscais do médico.
 * Implementa GET e PUT /v1/parametros-fiscais/:medicoId conforme /contratos.
 */

import { Router, type Request, type Response } from 'express';
import { consolidarParametrosFiscais } from '../tributacao/parametros-tributarios.js';
import type { ParametrosFiscaisExtraidos } from '../../../contratos/tipos-fiscal.js';

export interface ParametrosRepositorioPort {
  obter(medicoId: string): Promise<ParametrosFiscaisExtraidos | null>;
  salvar(medicoId: string, parametros: ParametrosFiscaisExtraidos): Promise<void>;
}

export function criarRouterParametros(repositorio?: ParametrosRepositorioPort): Router {
  const router = Router();

  router.get('/parametros-fiscais/:medicoId', async (req: Request, res: Response): Promise<void> => {
    try {
      const medicoId = String(req.params.medicoId);
      const parametros = repositorio ? await repositorio.obter(medicoId) : null;
      const consolidados = consolidarParametrosFiscais(parametros || {});
      res.json({ sucesso: true, parametros: consolidados });
    } catch (err: any) {
      res.status(500).json({ sucesso: false, mensagem: err?.message || 'Erro ao consultar parâmetros' });
    }
  });

  router.put('/parametros-fiscais/:medicoId', async (req: Request, res: Response): Promise<void> => {
    try {
      const medicoId = String(req.params.medicoId);
      const novosParametros = consolidarParametrosFiscais(req.body || {});
      if (repositorio) {
        await repositorio.salvar(medicoId, novosParametros);
      }
      res.json({ sucesso: true, parametros: novosParametros });
    } catch (err: any) {
      res.status(500).json({ sucesso: false, mensagem: err?.message || 'Erro ao atualizar parâmetros' });
    }
  });

  return router;
}
