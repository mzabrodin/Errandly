import { z } from 'zod';

import type { TokenCipher } from '../../common/crypto/token-cipher.js';
import { LOCALES, type AuthProvider } from '../../common/domain.js';
import { hashToken } from '../../common/tokens.js';

export const SIGN_IN_STATE_TTL_MS = 10 * 60 * 1000;

const payloadSchema = z.object({
  provider: z.string(),
  nonceHash: z.string(),
  next: z.string(),
  locale: z.enum(LOCALES).optional(),
  timezone: z.string().optional(),
  expiresAt: z.number(),
});

type Payload = z.infer<typeof payloadSchema>;
export type SignInIntent = Omit<Payload, 'provider' | 'nonceHash' | 'expiresAt'>;

/**
 * Sealed with the token key and bound to a nonce kept in a cookie of the browser that started
 * the flow, so a callback URL from someone else's flow cannot sign this browser in (login CSRF)
 */
export function sealSignInState(
  cipher: TokenCipher,
  provider: AuthProvider,
  nonce: string,
  intent: SignInIntent,
  now: Date,
): string {
  const payload: Payload = {
    ...intent,
    provider,
    nonceHash: hashToken(nonce),
    expiresAt: now.getTime() + SIGN_IN_STATE_TTL_MS,
  };
  return cipher.encrypt(JSON.stringify(payload));
}

export function openSignInState(
  cipher: TokenCipher,
  provider: AuthProvider,
  sealed: { state: string; nonce: string },
  now: Date,
): SignInIntent | null {
  let json: unknown;
  try {
    json = JSON.parse(cipher.decrypt(sealed.state));
  } catch {
    return null;
  }
  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) return null;
  const { provider: sealedFor, nonceHash, expiresAt, ...intent } = parsed.data;
  const valid =
    sealedFor === provider && nonceHash === hashToken(sealed.nonce) && expiresAt > now.getTime();
  return valid ? intent : null;
}
