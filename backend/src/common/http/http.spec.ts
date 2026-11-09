import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

import type { EnvironmentVariables } from '../../config/env.validation.js';
import { DomainError } from '../errors/domain-error.js';
import { currentUserOf, optionalUserOf, setRequestUser } from './auth.js';
import { rateLimits, StrictRateLimit } from './rate-limit.js';
import {
  clearSessionCookie,
  readSessionCookie,
  secureCookies,
  setSessionCookie,
} from './session-cookie.js';

function contextFor(request: object, handler?: unknown): ExecutionContext {
  return {
    getHandler: () => handler,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('request user', () => {
  it('reads the user the guard attached', () => {
    const request = {};
    setRequestUser(request, { id: 'u1', sessionId: 's1' });

    expect(currentUserOf(contextFor(request))).toEqual({ id: 'u1', sessionId: 's1' });
    expect(optionalUserOf(contextFor(request))).toEqual({ id: 'u1', sessionId: 's1' });
  });

  it('answers 401 or null when nobody is signed in', () => {
    expect(() => currentUserOf(contextFor({}))).toThrow(new DomainError('UNAUTHENTICATED'));
    expect(optionalUserOf(contextFor({}))).toBeNull();
  });
});

const request = (cookie?: string) =>
  ({ headers: cookie === undefined ? {} : { cookie } }) as Request;

const config = (env: string) =>
  ({ get: () => env }) as unknown as ConfigService<EnvironmentVariables, true>;

describe('session cookie', () => {
  it('reads the token among other cookies', () => {
    expect(readSessionCookie(request('theme=dark; errandly_session=abc'))).toBe('abc');
    expect(readSessionCookie(request('theme=dark'))).toBeUndefined();
    expect(readSessionCookie(request('errandly_session='))).toBeUndefined();
    expect(readSessionCookie(request())).toBeUndefined();
  });

  it('is HttpOnly, SameSite=Lax, scoped to /api and secure when asked', () => {
    const calls: unknown[][] = [];
    const response = {
      cookie: (...args: unknown[]) => calls.push(['set', ...args]),
      clearCookie: (...args: unknown[]) => calls.push(['clear', ...args]),
    } as unknown as Response;
    const expiresAt = new Date('2026-12-09T00:00:00Z');

    setSessionCookie(response, { token: 'abc', expiresAt }, true);
    clearSessionCookie(response, false);

    const options = { httpOnly: true, sameSite: 'lax', path: '/api' };
    expect(calls).toEqual([
      ['set', 'errandly_session', 'abc', { ...options, secure: true, expires: expiresAt }],
      ['clear', 'errandly_session', { ...options, secure: false }],
    ]);
  });

  it('is secure only in production', () => {
    expect(secureCookies(config('production'))).toBe(true);
    expect(secureCookies(config('development'))).toBe(false);
  });
});

describe('rate limits', () => {
  class Routes {
    @StrictRateLimit()
    login(): void {}

    list(): void {}
  }

  it('applies the auth limit only to routes marked strict', () => {
    const { throttlers } = rateLimits(100, 10) as { throttlers: { skipIf?: unknown }[] };
    const [general, auth] = throttlers as [
      { limit: number; ttl: number },
      { limit: number; skipIf: (context: ExecutionContext) => boolean },
    ];

    expect(general).toMatchObject({ limit: 100, ttl: 60_000 });
    expect(auth.limit).toBe(10);
    expect(auth.skipIf(contextFor({}, Reflect.get(Routes.prototype, 'login')))).toBe(false);
    expect(auth.skipIf(contextFor({}, Reflect.get(Routes.prototype, 'list')))).toBe(true);
  });
});
