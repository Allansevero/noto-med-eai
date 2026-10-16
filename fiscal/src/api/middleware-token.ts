/**
 * Middleware de autenticação interna entre serviços.
 * Valida o cabeçalho X-Internal-Token para garantir que apenas requisições
 * originadas na rede interna autorizada (ex: pelo /noto) sejam aceitas.
 */

import type { Request, Response, NextFunction } from 'express';

export function criarMiddlewareTokenInterno(tokenEsperado: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const tokenRecebido =
      (req.headers['x-internal-token'] as string) ||
      (req.headers['authorization']?.replace(/^Bearer\s+/i, ''));

    if (!tokenRecebido || tokenRecebido !== tokenEsperado) {
      res.status(401).json({
        sucesso: false,
        codigo: 'TOKEN_INTERNO_INVALIDO',
        mensagem: 'Acesso não autorizado: token interno inválido ou ausente.'
      });
      return;
    }

    next();
  };
}
