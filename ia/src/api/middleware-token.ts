/**
 * Middleware de autenticação interna por token para o serviço de IA.
 * Protege os endpoints em /v1/analise exigindo o cabeçalho X-Internal-Token.
 */

import type { Request, Response, NextFunction } from 'express';

export function criarMiddlewareTokenInternoIa(tokenEsperado: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tokenRecebido =
      (req.headers['x-internal-token'] as string) ||
      (req.headers['authorization']?.replace(/^Bearer\s+/i, ''));

    if (!tokenRecebido || tokenRecebido !== tokenEsperado) {
      res.status(401).json({
        sucesso: false,
        codigo: 'TOKEN_INTERNO_INVALIDO',
        mensagem: 'Acesso não autorizado ao serviço de IA: token interno inválido ou ausente.'
      });
      return;
    }

    next();
  };
}
