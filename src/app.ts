import path from 'node:path';
import express, { type Express } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Logger } from 'pino';
import { APP_VERSION, type AppConfig, MAX_REQUEST_BODY } from './config';
import { type Db, isHealthy } from './lib/database';
import { SecurityEvent } from './lib/logger';
import { createAuthRouter } from './routes/auth';
import { createTasksRouter } from './routes/tasks';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

/**
 * Montagem da aplicação Express.
 *
 * Separada de `server.ts` para que os testes possam instanciar a aplicação
 * sobre um banco em memória, sem abrir portas de rede.
 */

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const AUTH_MAX_REQUESTS = 10;
const GLOBAL_MAX_REQUESTS = 100;

export function createApp(db: Db, config: AppConfig, logger: Logger): Express {
  const app = express();

  // RS-009 — cabeçalhos de segurança HTTP.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      // A spec exige DENY; o padrão do Helmet é SAMEORIGIN (RS-009).
      frameguard: { action: 'deny' },
      hsts: { maxAge: 31_536_000, includeSubDomains: true },
    }),
  );
  app.disable('x-powered-by');

  // Necessário para que o rate limiter identifique o IP real atrás do proxy.
  app.set('trust proxy', 1);

  // RS-008 — limite de tamanho do corpo.
  app.use(express.json({ limit: MAX_REQUEST_BODY }));

  const rateLimitHandler = (max: number) =>
    rateLimit({
      windowMs: RATE_LIMIT_WINDOW_MS,
      max,
      standardHeaders: true,
      legacyHeaders: false,
      // Desativado em teste para não interferir nos casos de autorização.
      skip: () => config.nodeEnv === 'test',
      handler: (req, res) => {
        logger.warn({ event: SecurityEvent.RATE_LIMITED, path: req.path });
        res.status(429).json({ error: 'Muitas requisições. Tente novamente mais tarde.' });
      },
    });

  /**
   * RF-020 — health check.
   *
   * Registrado antes dos limitadores: a pipeline e o monitoramento consultam
   * este endpoint com frequência e não devem ser bloqueados por limite de taxa.
   */
  app.get('/health', (_req, res) => {
    const healthy = isHealthy(db);
    res.status(healthy ? 200 : 503).json({
      status: healthy ? 'ok' : 'degraded',
      version: APP_VERSION,
      uptime: Number(process.uptime().toFixed(2)),
      timestamp: new Date().toISOString(),
    });
  });

  // RS-010 — limitação de taxa: mais restritiva na autenticação.
  app.use('/api/auth', rateLimitHandler(AUTH_MAX_REQUESTS));
  app.use('/api', rateLimitHandler(GLOBAL_MAX_REQUESTS));

  app.use('/api/auth', createAuthRouter(db, config, logger));
  app.use('/api/tasks', createTasksRouter(db, config, logger));

  // Página estática de demonstração, usada para verificar a publicação.
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));

  return app;
}
