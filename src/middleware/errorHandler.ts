import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { SecurityEvent } from '../lib/logger';

/**
 * Tratamento de erros (RS-011).
 *
 * O cliente recebe apenas uma mensagem genérica e um identificador de
 * correlação. Stack trace, SQL, caminhos de arquivo e nomes de dependência
 * ficam restritos ao log do servidor.
 */

/** Erro de negócio com código HTTP definido, seguro para exibir ao cliente. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Recurso não encontrado' });
}

/**
 * Erros levantados pelo interpretador de corpo (`express.json`) para entrada
 * malformada ou acima do limite de tamanho.
 *
 * São falhas do cliente, e não do servidor: sem este tratamento seriam
 * classificadas como 500, violando RS-008 e RS-011.
 */
function bodyParserStatus(err: unknown): number | null {
  if (typeof err !== 'object' || err === null) {
    return null;
  }

  const candidate = err as { type?: unknown; status?: unknown };
  const knownTypes = ['entity.too.large', 'entity.parse.failed', 'encoding.unsupported'];

  if (typeof candidate.type === 'string' && knownTypes.includes(candidate.type)) {
    return typeof candidate.status === 'number' ? candidate.status : 400;
  }

  return null;
}

export function errorHandler(logger: Logger) {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (err instanceof AppError) {
      res.status(err.status).json({
        error: err.message,
        ...(err.details ? { details: err.details } : {}),
      });
      return;
    }

    const parserStatus = bodyParserStatus(err);
    if (parserStatus !== null) {
      // Mensagem genérica: não repassa o detalhe do interpretador (RS-011).
      res.status(parserStatus).json({ error: 'Requisição inválida' });
      return;
    }

    // Erro não previsto: o detalhe vai para o log, o cliente recebe apenas o
    // identificador de correlação.
    const correlationId = randomUUID();
    logger.error(
      {
        event: SecurityEvent.UNHANDLED_ERROR,
        correlationId,
        path: req.path,
        method: req.method,
        err,
      },
      'Erro não tratado',
    );

    res.status(500).json({ error: 'Erro interno do servidor', correlationId });
  };
}
