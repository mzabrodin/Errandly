import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { Injectable } from '@nestjs/common';

interface ScryptParams {
  /** log2 of the CPU/memory cost N */
  logN: number;
  r: number;
  p: number;
}

// OWASP Password Storage Cheat Sheet: scrypt N=2^16, r=8, p=2 (about 64 MB per hash)
const CURRENT: ScryptParams = { logN: 16, r: 8, p: 2 };
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const PREFIX = 'scrypt';

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const N = 2 ** params.logN;
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N, r: params.r, p: params.p, maxmem: 256 * N * params.r },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

function parseInteger(value: string | undefined): number | null {
  if (value === undefined || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/** Port: services depend on this, not on a hashing algorithm */
export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  /** Constant-time check; a malformed hash never matches */
  abstract verify(password: string, stored: string): Promise<boolean>;
}

/** Password hashes in the self-describing format `scrypt$logN$r$p$salt$hash` (base64) */
@Injectable()
export class ScryptPasswordHasher extends PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const key = await derive(password, salt, CURRENT);
    const { logN, r, p } = CURRENT;
    return [PREFIX, logN, r, p, salt.toString('base64'), key.toString('base64')].join('$');
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [prefix, logN, r, p, salt, hash] = stored.split('$');
    const params = { logN: parseInteger(logN), r: parseInteger(r), p: parseInteger(p) };
    if (
      prefix !== PREFIX ||
      params.logN === null ||
      params.r === null ||
      params.p === null ||
      salt === undefined ||
      hash === undefined
    ) {
      return false;
    }
    const expected = Buffer.from(hash, 'base64');
    const actual = await derive(password, Buffer.from(salt, 'base64'), {
      logN: params.logN,
      r: params.r,
      p: params.p,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}
