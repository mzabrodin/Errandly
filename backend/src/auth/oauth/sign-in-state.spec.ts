import type { ConfigService } from '@nestjs/config';

import { TokenCipher } from '../../common/crypto/token-cipher.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { openSignInState, sealSignInState, SIGN_IN_STATE_TTL_MS } from './sign-in-state.js';

const NOW = new Date('2026-11-15T10:00:00Z');
const config = {
  get: () => Buffer.alloc(32, 7).toString('base64'),
} as unknown as ConfigService<EnvironmentVariables, true>;
const cipher = new TokenCipher(config);
const intent = { next: '/g/1', locale: 'en', timezone: 'Europe/Kyiv' } as const;

describe('OAuth sign-in state', () => {
  const state = sealSignInState(cipher, 'google', 'nonce', intent, NOW);

  it('gives the intent back to the browser holding the nonce', () => {
    expect(openSignInState(cipher, 'google', { state, nonce: 'nonce' }, NOW)).toEqual(intent);
  });

  it('refuses another browser, an expired flow and a forgery', () => {
    expect(openSignInState(cipher, 'google', { state, nonce: 'other' }, NOW)).toBeNull();
    const later = new Date(NOW.getTime() + SIGN_IN_STATE_TTL_MS);
    expect(openSignInState(cipher, 'google', { state, nonce: 'nonce' }, later)).toBeNull();
    expect(openSignInState(cipher, 'google', { state: 'forged', nonce: 'nonce' }, NOW)).toBeNull();
    const malformed = cipher.encrypt('{"provider":"google"}');
    expect(openSignInState(cipher, 'google', { state: malformed, nonce: 'nonce' }, NOW)).toBeNull();
  });

  it("is not accepted at another provider's callback", () => {
    const sealedForOther = cipher.encrypt(
      JSON.stringify({ ...JSON.parse(cipher.decrypt(state)), provider: 'github' }),
    );
    expect(
      openSignInState(cipher, 'google', { state: sealedForOther, nonce: 'nonce' }, NOW),
    ).toBeNull();
  });
});
