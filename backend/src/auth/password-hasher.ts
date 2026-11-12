import { hash, verify, type Options } from '@node-rs/argon2';

export abstract class PasswordHasher {
  abstract hash(password: string): Promise<string>;
  /** Constant-time check; a malformed hash never matches */
  abstract verify(password: string, stored: string): Promise<boolean>;
}

export interface Argon2Params {
  /** KiB */
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

/** OWASP Password Storage Cheat Sheet, argon2id: m=19 MiB, t=2, p=1 (NFR-SEC-01) */
export const ARGON2_OWASP: Argon2Params = { memoryCost: 19_456, timeCost: 2, parallelism: 1 };

/** PHC strings keep their own parameters, so stronger ones can roll out without breaking logins */
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
      return false;
    }
  }
}
