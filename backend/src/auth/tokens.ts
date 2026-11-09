import { createHash, randomBytes } from 'node:crypto';

/** 256 random bits, URL-safe (SYS-24 asks for at least 128) */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Only the SHA-256 of a session or email token is stored, so a database leak does not hand
 * out working links or sessions. A fast hash is enough: the token is random, not a password.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
