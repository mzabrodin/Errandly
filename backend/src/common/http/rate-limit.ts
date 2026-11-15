import { Injectable, SetMetadata, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
} from '@nestjs/throttler';

import { DomainError } from '../errors/domain-error.js';
import { MINUTE_MS } from '../time.js';
import { requestUserOf } from './auth.js';

const STRICT_RATE_LIMIT_KEY = 'errandly:strictRateLimit';
const reflector = new Reflector();

/** For routes that guess at secrets, send emails or call Google or sharp (NFR-SEC-07) */
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

/**
 * Runs between SessionGuard and AuthenticatedGuard (AuthModule): a signed-in caller is counted by
 * account, because flatmates usually share one home IP; anyone else, rejected ones too, by IP.
 */
@Injectable()
export class CallerThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(request: Record<string, unknown>): Promise<string> {
    const user = requestUserOf(request);
    return user ? `user:${user.id}` : `ip:${await super.getTracker(request)}`;
  }

  protected override throwThrottlingException(
    _context: ExecutionContext,
    { timeToBlockExpire }: ThrottlerLimitDetail,
  ): Promise<void> {
    return Promise.reject(
      new DomainError('TOO_MANY_REQUESTS', { retryAfterSeconds: timeToBlockExpire }),
    );
  }
}
