import type { ConfigService } from '@nestjs/config';

import { TokenCipher } from '../../common/crypto/token-cipher.js';
import type { EnvironmentVariables } from '../../config/env.validation.js';
import { sealState, STATE_TTL_MS, stateIsValid } from './oauth-state.js';

const NOW = new Date('2026-11-14T10:00:00Z');
const config = {
  get: () => Buffer.alloc(32, 3).toString('base64'),
} as unknown as ConfigService<EnvironmentVariables, true>;
const cipher = new TokenCipher(config);

describe('OAuth state', () => {
  it('belongs to the user who started the flow', () => {
    const state = sealState(cipher, 'anya', NOW);

    expect(stateIsValid(cipher, state, 'anya', NOW)).toBe(true);
    expect(stateIsValid(cipher, state, 'bohdan', NOW)).toBe(false);
  });

  it('expires after ten minutes', () => {
    const state = sealState(cipher, 'anya', NOW);

    expect(stateIsValid(cipher, state, 'anya', new Date(NOW.getTime() + STATE_TTL_MS))).toBe(false);
  });

  it('rejects anything that was not sealed by Errandly', () => {
    expect(stateIsValid(cipher, 'forged', 'anya', NOW)).toBe(false);
    expect(stateIsValid(cipher, cipher.encrypt('{"userId":1}'), 'anya', NOW)).toBe(false);
  });
});
