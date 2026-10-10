import { Router } from 'express';
import type pg from 'pg';
import type { ResultadoStatusWhatsapp } from '../onboarding/io/consultar-status-instancia-whatsapp.js';

/** Consulta do painel: sessão validada, sem disparar treino ou ações fiscais. */
export function criarRouterStatusWhatsapp(deps: {
  pool: pg.Pool;
  autenticar: (token: string) => Promise<string | null>;
  consultar: (medicoId: string) => Promise<ResultadoStatusWhatsapp>;
}) {
  const router = Router();
  router.get('/status', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try {
      const header = req.header('Authorization') || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      const userId = token ? await deps.autenticar(token) : null;
      if (!userId) { res.status(401).json({ ok: false, detalhe: 'Entre novamente para verificar o WhatsApp.' }); return; }
      const medico = (await deps.pool.query(
        'select m.id from medicos m join usuarios u on u.id = m.usuario_id where u.auth_user_id = $1 limit 1', [userId]
      )).rows[0];
      if (!medico) { res.status(403).json({ ok: false, detalhe: 'Conta médica não encontrada.' }); return; }
      const resultado = await deps.consultar(medico.id);
      res.status(resultado.ok ? 200 : 502).json({ ok: resultado.ok, conectado: resultado.conectado, status: resultado.status });
    } catch {
      res.status(502).json({ ok: false, detalhe: 'Não foi possível verificar a conexão do WhatsApp.' });
    }
  });
  return router;
}
