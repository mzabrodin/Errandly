import type { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../../config/env.validation.js';
import { TokenCipher } from './token-cipher.js';

function cipherWith(fill: number): TokenCipher {
  const key = Buffer.alloc(32, fill).toString('base64');
  const config = { get: () => key } as unknown as ConfigService<EnvironmentVariables, true>;
  return new TokenCipher(config);
}

describe('TokenCipher', () => {
  const cipher = cipherWith(1);

  it('round-trips a value and never repeats the ciphertext', () => {
    const first = cipher.encrypt('1//refresh-token');
    const second = cipher.encrypt('1//refresh-token');

    expect(first).not.toContain('refresh');
    expect(first).not.toBe(second);
    expect(cipher.decrypt(first)).toBe('1//refresh-token');
  });

  it('rejects a tampered value', () => {
    const [version, iv, tag, data] = cipher.encrypt('secret').split('.');
    const flipped = Buffer.from(data ?? '', 'base64url');
    flipped[0] = (flipped[0] ?? 0) ^ 1;

    expect(() =>
      cipher.decrypt([version, iv, tag, flipped.toString('base64url')].join('.')),
    ).toThrow(/unable to authenticate/);
  });

  it('rejects a value sealed with another key', () => {
    expect(() => cipherWith(2).decrypt(cipher.encrypt('secret'))).toThrow(/unable to authenticate/);
  });

  it('rejects an unknown format', () => {
    expect(() => cipher.decrypt('plain-text')).toThrow('Unknown encrypted value format');
    expect(() => cipher.decrypt('v2.a.b.c')).toThrow('Unknown encrypted value format');
  });
});
