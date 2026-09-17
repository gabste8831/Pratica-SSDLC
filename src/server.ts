import { createApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './lib/database';
import { createLogger } from './lib/logger';

/**
 * Ponto de entrada do processo.
 *
 * Implementa RF-021 (falha rápida em configuração inválida) e RF-022
 * (encerramento gracioso).
 */

const SHUTDOWN_TIMEOUT_MS = 10_000;

function main(): void {
  let config;

  try {
    config = loadConfig();
  } catch (err) {
    // A aplicação não inicia sem configuração válida — em especial sem
    // JWT_SECRET adequado (RS-002, CA-004.2, CA-004.3).
    process.stderr.write(`${(err as Error).message}\n`);
    process.exit(1);
    return;
  }

  const logger = createLogger(config.logLevel);
  const db = openDatabase(config.databasePath);
  const app = createApp(db, config, logger);

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'SecureTasks iniciado');
  });

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'Encerrando');

    const forceExit = setTimeout(() => {
      logger.error('Encerramento excedeu o tempo limite; forçando saída');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(() => {
      db.close();
      clearTimeout(forceExit);
      logger.info('Encerrado');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
