import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { extractBearerToken, verifyToken } from '../lib/security';
import { SecurityEvent } from '../lib/logger';

/**
 * Middleware de autenticação (RS-003).
 *
 * Rejeita com 401 quando o token está ausente, malformado, expirado, assinado
 * com chave incorreta ou com algoritmo diferente de HS256.
 */

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Identidade do portador do token, preenchida por {@link authenticate}. */
      user?: { id: string; email: string };
    }
  }
}

export function authenticate(secret: string, logger: Logger) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = extractBearerToken(req.header('authorization'));

    if (!token) {
      logger.warn({ event: SecurityEvent.TOKEN_REJECTED, reason: 'ausente', path: req.path });
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    const payload = verifyToken(token, secret);

    if (!payload) {
      logger.warn({ event: SecurityEvent.TOKEN_REJECTED, reason: 'inválido', path: req.path });
      res.status(401).json({ error: 'Não autenticado' });
      return;
    }

    req.user = { id: payload.sub, email: payload.email };
    next();
  };
}
