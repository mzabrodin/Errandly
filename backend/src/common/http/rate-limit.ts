import { SetMetadata, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

const STRICT_RATE_LIMIT_KEY = 'errandly:strictRateLimit';
const MINUTE_MS = 60 * 1000;
const reflector = new Reflector();

/**
 * Routes that guess at secrets (sign-in, reset links) or send emails get the tighter
 * `auth` limit on top of the global one (NFR-SEC-07). The account lockout (FR-06) still
 * applies on its own, whatever the IP.
 */
export function StrictRateLimit(): MethodDecorator {
  return SetMetadata(STRICT_RATE_LIMIT_KEY, true);
}

function isStrict(context: ExecutionContext): boolean {
  return reflector.get<boolean | undefined>(STRICT_RATE_LIMIT_KEY, context.getHandler()) === true;
}

/** Per-IP limits; behind nginx the IP comes from X-Forwarded-For (trust proxy) */
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
