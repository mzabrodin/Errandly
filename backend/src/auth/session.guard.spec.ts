import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { DomainError } from '../common/errors/domain-error.js';
import { Public, requestUserOf } from '../common/http/auth.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { SessionGuard } from './session.guard.js';
import type { Authenticated, SessionService } from './sessions.service.js';

class Routes {
  @Public()
  open(): void {}

  closed(): void {}
}

function contextFor(handler: keyof Routes, cookie?: string) {
  const request = { headers: cookie === undefined ? {} : { cookie } };
  const cookies: [string, string, object][] = [];
  const response = {
    cookie: (name: string, value: string, options: object) => cookies.push([name, value, options]),
  };
  const context = {
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
  } as unknown as ExecutionContext;
  return { context, request, cookies };
}

function guardWith(result: Authenticated | null) {
  const sessions = { authenticate: () => Promise.resolve(result) };
  const config = { get: () => 'production' };
  return new SessionGuard(
    new Reflector(),
    sessions as unknown as SessionService,
    config as unknown as ConfigService<EnvironmentVariables, true>,
  );
}

const user = { id: 'u1', sessionId: 's1' };

describe('SessionGuard', () => {
  it('denies a protected route without a session', async () => {
    const { context } = contextFor('closed');

    await expect(guardWith(null).canActivate(context)).rejects.toEqual(
      new DomainError('UNAUTHENTICATED'),
    );
  });

  it('lets a public route through without a session', async () => {
    const { context, request } = contextFor('open');

    await expect(guardWith(null).canActivate(context)).resolves.toBe(true);
    expect(requestUserOf(request)).toBeUndefined();
  });

  it('attaches the user of a valid session', async () => {
    const { context, request, cookies } = contextFor('closed', 'errandly_session=abc');

    await expect(guardWith({ user, refreshed: null }).canActivate(context)).resolves.toBe(true);
    expect(requestUserOf(request)).toEqual(user);
    expect(cookies).toEqual([]);
  });

  it('sends the cookie again when the session slid forward', async () => {
    const expiresAt = new Date('2026-12-09T12:00:00.000Z');
    const { context, cookies } = contextFor('closed', 'errandly_session=abc');

    await guardWith({ user, refreshed: { token: 'abc', expiresAt } }).canActivate(context);

    expect(cookies).toEqual([
      [
        'errandly_session',
        'abc',
        expect.objectContaining({ httpOnly: true, secure: true, expires: expiresAt }),
      ],
    ]);
  });
});
