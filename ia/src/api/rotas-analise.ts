/**
 * Roteador de análise de inteligência artificial e autocorreção fiscal.
 * Implementa POST /v1/analise/detectar-candidatos e POST /v1/analise/autocorrigir-falha conforme /contratos.
 */

import { Router, type Request, type Response } from 'express';
import { decidirCandidatoConversa } from '../correlacao/correlacionar-consulta-pagamento.js';
import { diagnosticarEAutocorrigirFalha } from '../autocorrecao/analisar-rejeicao-fiscal.js';
import { CODIGOS_ERRO_IA } from '../../../contratos/codigos-erro.js';

export function criarRouterAnalise(): Router {
  const router = Router();

  router.post('/analise/detectar-candidatos', (req: Request, res: Response): void => {
    try {
      const { medicoId, dadosMedico, conversa } = req.body || {};

      if (!medicoId || !dadosMedico || !conversa) {
        res.status(400).json({
          sucesso: false,
          codigo: CODIGOS_ERRO_IA.CONVERSA_SEM_MENSAGENS,
          mensagem: 'medicoId, dadosMedico e conversa são obrigatórios.'
        });
        return;
      }

      const resultado = decidirCandidatoConversa({
        medicoId,
        dadosMedico,
        conversa
      });

      res.status(200).json(resultado);
    } catch (err: any) {
      res.status(500).json({
        sucesso: false,
        codigo: CODIGOS_ERRO_IA.ERRO_INTERNO_IA,
        mensagem: err?.message || 'Erro interno ao processar análise da conversa.'
      });
    }
  });

  router.post('/analise/autocorrigir-falha', (req: Request, res: Response): void => {
    try {
      const { medicoId, pedidoId, erroSefin, dadosNota, parametrosAtuais } = req.body || {};

      if (!medicoId || !pedidoId || !erroSefin) {
        res.status(400).json({
          sucesso: false,
          codigo: CODIGOS_ERRO_IA.ERRO_INTERNO_IA,
          mensagem: 'medicoId, pedidoId e erroSefin são obrigatórios.'
        });
        return;
      }

      const resultado = diagnosticarEAutocorrigirFalha({
        medicoId,
        pedidoId,
        erroSefin,
        dadosNota: dadosNota || {},
        parametrosAtuais: parametrosAtuais || {}
      });

      res.status(200).json(resultado);
    } catch (err: any) {
      res.status(500).json({
        sucesso: false,
        codigo: CODIGOS_ERRO_IA.ERRO_INTERNO_IA,
        mensagem: err?.message || 'Erro interno ao diagnosticar falha fiscal.'
      });
    }
  });

  return router;
}
