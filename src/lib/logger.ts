import pino from 'pino';

/**
 * Registro de eventos (RS-012).
 *
 * A opção `redact` garante que senhas, tokens e cabeçalhos de autorização nunca
 * cheguem ao log, mesmo que um objeto de requisição seja passado inteiro por
 * engano.
 */
export function createLogger(level: string, silent = false): pino.Logger {
  return pino({
    level,
    enabled: !silent,
    redact: {
      paths: [
        'password',
        'passwordHash',
        'password_hash',
        'token',
        'req.headers.authorization',
        'req.body.password',
        '*.password',
      ],
      censor: '[OCULTO]',
    },
    formatters: {
      level: (label) => ({ level: label }),
    },
  });
}

/** Eventos de segurança registrados conforme RS-012. */
export const SecurityEvent = {
  LOGIN_SUCCESS: 'auth.login.success',
  LOGIN_FAILURE: 'auth.login.failure',
  REGISTER_SUCCESS: 'auth.register.success',
  REGISTER_CONFLICT: 'auth.register.conflict',
  TOKEN_REJECTED: 'auth.token.rejected',
  RATE_LIMITED: 'security.rate_limited',
  UNHANDLED_ERROR: 'error.unhandled',
} as const;
