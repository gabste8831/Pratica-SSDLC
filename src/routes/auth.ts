import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import type { Logger } from 'pino';
import type { AppConfig } from '../config';
import { TOKEN_TTL_SECONDS } from '../config';
import type { Db, UserRow } from '../lib/database';
import { findUserByEmail, findUserById, insertUser } from '../lib/database';
import { hashPassword, issueToken, verifyPassword } from '../lib/security';
import { SecurityEvent } from '../lib/logger';
import { formatValidationIssues, loginSchema, registerSchema } from '../lib/schemas';
import { AppError } from '../middleware/errorHandler';
import { authenticate } from '../middleware/authenticate';

/**
 * Rotas de autenticação — implementa SPEC-001.
 */

/** Mensagem única para toda falha de autenticação (RS-004). */
const GENERIC_AUTH_FAILURE = 'Credenciais inválidas';

/** Projeção pública do usuário: exclui `password_hash` (RF-001). */
function toPublicUser(row: UserRow): { id: string; email: string; createdAt: string } {
  return { id: row.id, email: row.email, createdAt: row.created_at };
}

export function createAuthRouter(db: Db, config: AppConfig, logger: Logger): Router {
  const router = Router();

  /** RF-001 — registro de usuário. */
  router.post('/register', (req, res, next) => {
    void (async () => {
      try {
        const parsed = registerSchema.safeParse(req.body);
        if (!parsed.success) {
          throw new AppError(400, 'Dados inválidos', formatValidationIssues(parsed.error));
        }

        const { email, password } = parsed.data;

        if (findUserByEmail(db, email)) {
          logger.warn({ event: SecurityEvent.REGISTER_CONFLICT });
          throw new AppError(409, 'E-mail já cadastrado');
        }

        // Objeto montado campo a campo a partir do payload validado (RS-006).
        const user: UserRow = {
          id: randomUUID(),
          email,
          password_hash: await hashPassword(password),
          created_at: new Date().toISOString(),
        };

        insertUser(db, user);
        logger.info({ event: SecurityEvent.REGISTER_SUCCESS, userId: user.id });

        res.status(201).json(toPublicUser(user));
      } catch (err) {
        next(err);
      }
    })();
  });

  /** RF-002 — autenticação. */
  router.post('/login', (req, res, next) => {
    void (async () => {
      try {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
          // Payload malformado também produz 401: distinguir 400 de 401 aqui
          // revelaria informação sobre a política de credenciais (RS-004).
          throw new AppError(401, GENERIC_AUTH_FAILURE);
        }

        const { email, password } = parsed.data;
        const user = findUserByEmail(db, email);

        if (!user) {
          // Executa uma verificação descartável para que o tempo de resposta de
          // "usuário inexistente" se aproxime do de "senha incorreta" (RS-004).
          await verifyPassword(password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinv');
          logger.warn({ event: SecurityEvent.LOGIN_FAILURE, reason: 'usuário inexistente' });
          throw new AppError(401, GENERIC_AUTH_FAILURE);
        }

        if (!(await verifyPassword(password, user.password_hash))) {
          logger.warn({ event: SecurityEvent.LOGIN_FAILURE, reason: 'senha incorreta' });
          throw new AppError(401, GENERIC_AUTH_FAILURE);
        }

        const token = issueToken({ sub: user.id, email: user.email }, config.jwtSecret);
        logger.info({ event: SecurityEvent.LOGIN_SUCCESS, userId: user.id });

        res.status(200).json({ token, expiresIn: TOKEN_TTL_SECONDS });
      } catch (err) {
        next(err);
      }
    })();
  });

  /** RF-004 — identidade do usuário corrente. */
  router.get('/me', authenticate(config.jwtSecret, logger), (req, res, next) => {
    try {
      const user = req.user ? findUserById(db, req.user.id) : undefined;
      if (!user) {
        throw new AppError(401, 'Não autenticado');
      }
      res.status(200).json(toPublicUser(user));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
