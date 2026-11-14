import type { TokenCipher } from '../../common/crypto/token-cipher.js';

export const STATE_TTL_MS = 10 * 60 * 1000;

interface StatePayload {
  userId: string;
  expiresAt: number;
}

function isStatePayload(value: unknown): value is StatePayload {
  return (
    typeof value === 'object' &&
    value !== null &&
    'userId' in value &&
    typeof value.userId === 'string' &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'number'
  );
}

/** Sealed with the token key, so it cannot be forged for another user (CSRF) */
export function sealState(cipher: TokenCipher, userId: string, now: Date): string {
  const payload: StatePayload = { userId, expiresAt: now.getTime() + STATE_TTL_MS };
  return cipher.encrypt(JSON.stringify(payload));
}

export function stateIsValid(
  cipher: TokenCipher,
  state: string,
  userId: string,
  now: Date,
): boolean {
  let payload: unknown;
  try {
    payload = JSON.parse(cipher.decrypt(state));
  } catch {
    return false;
  }
  return isStatePayload(payload) && payload.userId === userId && payload.expiresAt > now.getTime();
}
