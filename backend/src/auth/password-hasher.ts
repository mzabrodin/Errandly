import { hash, verify, type Options } from '@node-rs/argon2';

/** Port: services depend on this, not on a hashing algorithm */
export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  /** Constant-time check; a malformed hash never matches */
  abstract verify(password: string, stored: string): Promise<boolean>;
}

export interface Argon2Params {
  /** Memory per hash in KiB */
  memoryCost: number;
  /** Passes over the memory */
  timeCost: number;
  parallelism: number;
}

/** OWASP Password Storage Cheat Sheet, argon2id: m=19 MiB, t=2, p=1 (NFR-SEC-01) */
export const ARGON2_OWASP: Argon2Params = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

/**
 * Argon2id hashes as PHC strings (`$argon2id$v=19$m=…,t=…,p=…$salt$hash`), so stored hashes
 * keep their own parameters and stronger ones can be rolled out without breaking old logins.
 * The algorithm defaults to argon2id; the option is not set because it is a `const enum`.
 */
export class Argon2PasswordHasher extends PasswordHasher {
  private readonly options: Options;

  constructor(params: Argon2Params = ARGON2_OWASP) {
    super();
    this.options = { ...params };
  }

  hash(password: string): Promise<string> {
    return hash(password.normalize('NFKC'), this.options);
  }

  async verify(password: string, stored: string): Promise<boolean> {
    try {
      return await verify(stored, password.normalize('NFKC'));
    } catch {
      // Not a PHC string, or one this library cannot read
      return false;
    }
  }
}
