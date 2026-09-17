import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { BCRYPT_COST_FACTOR, TOKEN_TTL_SECONDS } from '../config';

/**
 * Primitivas de segurança: derivação de senha (RS-001) e tokens (RS-002/RS-003).
 */

/** Algoritmo de assinatura aceito. Fixá-lo previne confusão de algoritmo (RS-003). */
const JWT_ALGORITHM = 'HS256' as const;

export interface TokenPayload {
  sub: string;
  email: string;
}

/** Deriva o hash bcrypt da senha (RS-001). */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_COST_FACTOR);
}

/**
 * Verifica a senha contra o hash armazenado (RS-001).
 *
 * A comparação é feita pela própria biblioteca, resistente a ataque de
 * temporização.
 */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

/** Emite um JWT HS256 com validade de {@link TOKEN_TTL_SECONDS} (RS-002). */
export function issueToken(payload: TokenPayload, secret: string): string {
  return jwt.sign({ email: payload.email }, secret, {
    subject: payload.sub,
    algorithm: JWT_ALGORITHM,
    expiresIn: TOKEN_TTL_SECONDS,
  });
}

/**
 * Valida um JWT.
 *
 * A opção `algorithms` restringe a verificação a HS256: um token com
 * `alg: none` ou assinado com outro algoritmo é rejeitado (RS-003).
 *
 * @returns o payload quando o token é válido, ou `null` em qualquer falha —
 *          ausência, formato inválido, assinatura incorreta ou expiração.
 */
export function verifyToken(token: string, secret: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, secret, { algorithms: [JWT_ALGORITHM] });

    if (typeof decoded === 'string' || !decoded.sub || typeof decoded.sub !== 'string') {
      return null;
    }

    const email = (decoded as jwt.JwtPayload).email;
    if (typeof email !== 'string') {
      return null;
    }

    return { sub: decoded.sub, email };
  } catch {
    return null;
  }
}

/**
 * Extrai o token do cabeçalho `Authorization`.
 *
 * @returns o token, ou `null` se o cabeçalho estiver ausente ou malformado.
 */
export function extractBearerToken(header: string | undefined): string | null {
  if (!header) {
    return null;
  }

  const [scheme, value, ...rest] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !value || rest.length > 0) {
    return null;
  }

  return value;
}
