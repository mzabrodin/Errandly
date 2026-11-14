import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvironmentVariables } from '../../config/env.validation.js';

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;

/** Secrets at rest (NFR-SEC-05) as `v1.<iv>.<tag>.<ciphertext>`, base64url */
@Injectable()
export class TokenCipher {
  private readonly key: Buffer;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.key = Buffer.from(config.get('TOKEN_ENCRYPTION_KEY', { infer: true }), 'base64');
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [VERSION, iv, cipher.getAuthTag(), data]
      .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
      .join('.');
  }

  decrypt(sealed: string): string {
    const [version, iv, tag, data, ...rest] = sealed.split('.');
    if (version !== VERSION || iv === undefined || tag === undefined || data === undefined) {
      throw new Error('Unknown encrypted value format');
    }
    if (rest.length > 0) throw new Error('Unknown encrypted value format');
    const decipher = createDecipheriv(ALGORITHM, this.key, Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(data, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
