import { z } from 'zod';

/**
 * Configuração da aplicação.
 *
 * Implementa RF-021 (configuração por ambiente) e RS-002 (segredo de assinatura
 * obrigatório e com entropia mínima). A validação ocorre na inicialização: uma
 * configuração inválida aborta o processo em vez de degradar para um padrão
 * inseguro.
 */

/** Comprimento mínimo do segredo HS256, conforme RS-002. */
export const MIN_JWT_SECRET_LENGTH = 32;

const configSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535).default(3000),
  nodeEnv: z.enum(['development', 'test', 'production']).default('development'),
  jwtSecret: z
    .string({ required_error: 'JWT_SECRET é obrigatório' })
    .min(
      MIN_JWT_SECRET_LENGTH,
      `JWT_SECRET deve ter no mínimo ${MIN_JWT_SECRET_LENGTH} caracteres`,
    ),
  databasePath: z.string().min(1).default('./data/securetasks.db'),
  logLevel: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export type AppConfig = Readonly<z.infer<typeof configSchema>>;

/** Duração do token de sessão em segundos (RS-002). */
export const TOKEN_TTL_SECONDS = 3600;

/** Fator de custo do bcrypt (RS-001). */
export const BCRYPT_COST_FACTOR = 12;

/** Tamanho máximo do corpo da requisição (RS-008). */
export const MAX_REQUEST_BODY = '100kb';

/** Versão da aplicação exposta em /health (RF-020). */
export const APP_VERSION = '1.0.0';

/**
 * Lê e valida a configuração a partir do ambiente.
 *
 * @throws {Error} quando alguma variável obrigatória está ausente ou inválida.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.safeParse({
    port: env.PORT,
    nodeEnv: env.NODE_ENV,
    jwtSecret: env.JWT_SECRET,
    databasePath: env.DATABASE_PATH,
    logLevel: env.LOG_LEVEL,
  });

  if (!parsed.success) {
    const detalhes = parsed.error.issues
      .map((issue) => `${issue.path.join('.') || '(raiz)'}: ${issue.message}`)
      .join('; ');
    throw new Error(`Configuração inválida — ${detalhes}`);
  }

  return Object.freeze(parsed.data);
}
