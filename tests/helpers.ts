import type { Express } from 'express';
import request from 'supertest';
import { createApp } from '../src/app';
import type { AppConfig } from '../src/config';
import { type Db, openDatabase } from '../src/lib/database';
import { createLogger } from '../src/lib/logger';

/** Infraestrutura comum aos testes: aplicação sobre banco em memória. */

export const TEST_SECRET = 'segredo-de-teste-com-mais-de-32-caracteres';

export interface TestContext {
  app: Express;
  db: Db;
  config: AppConfig;
}

export function createTestContext(overrides: Partial<AppConfig> = {}): TestContext {
  const config: AppConfig = Object.freeze({
    port: 0,
    nodeEnv: 'test' as const,
    jwtSecret: TEST_SECRET,
    databasePath: ':memory:',
    logLevel: 'fatal' as const,
    ...overrides,
  });

  const db = openDatabase(':memory:');
  const logger = createLogger(config.logLevel, true);

  return { app: createApp(db, config, logger), db, config };
}

/** Registra um usuário e devolve o token de acesso. */
export async function createUserAndLogin(
  app: Express,
  email: string,
  password = 'SenhaSegura123',
): Promise<{ token: string; userId: string }> {
  const registered = await request(app).post('/api/auth/register').send({ email, password });

  const loggedIn = await request(app).post('/api/auth/login').send({ email, password });

  return { token: loggedIn.body.token as string, userId: registered.body.id as string };
}

/** Cria uma tarefa em nome do portador do token. */
export async function createTask(
  app: Express,
  token: string,
  body: Record<string, unknown> = { title: 'Tarefa de teste' },
): Promise<request.Response> {
  return request(app).post('/api/tasks').set('Authorization', `Bearer ${token}`).send(body);
}
