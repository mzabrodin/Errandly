import { SetMetadata, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

const STRICT_RATE_LIMIT_KEY = 'errandly:strictRateLimit';
const MINUTE_MS = 60 * 1000;
const reflector = new Reflector();

/** For routes that guess at secrets or send emails (NFR-SEC-07) */
export function StrictRateLimit(): MethodDecorator {
  return SetMetadata(STRICT_RATE_LIMIT_KEY, true);
}

function isStrict(context: ExecutionContext): boolean {
  return reflector.get<boolean | undefined>(STRICT_RATE_LIMIT_KEY, context.getHandler()) === true;
}

export function rateLimits(perMinute: number, authPerMinute: number): ThrottlerModuleOptions {
  return {
    throttlers: [
      { name: 'default', ttl: MINUTE_MS, limit: perMinute },
      {
        name: 'auth',
        ttl: MINUTE_MS,
        limit: authPerMinute,
        skipIf: (context) => !isStrict(context),
      },
    ],
  };
}
