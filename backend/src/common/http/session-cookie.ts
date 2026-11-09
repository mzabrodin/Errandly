import type { ConfigService } from '@nestjs/config';
import { parse } from 'cookie';
import type { CookieOptions, Request, Response } from 'express';

import { NodeEnv, type EnvironmentVariables } from '../../config/env.validation.js';
import { API_PREFIX } from '../../config/urls.js';

/** HttpOnly cookie with the raw session token; only its SHA-256 is stored (SYS-24) */
export const SESSION_COOKIE = 'errandly_session';

function cookieOptions(secure: boolean): CookieOptions {
  return {
    httpOnly: true,
    // Lax: sent on top-level navigation only, so other sites cannot post with it (CSRF)
    sameSite: 'lax',
    secure,
    path: `/${API_PREFIX}`,
  };
}

/** Secure cookies in production, where the app is served over HTTPS (NFR-SEC-02) */
export function secureCookies(config: ConfigService<EnvironmentVariables, true>): boolean {
  return config.get('NODE_ENV', { infer: true }) === NodeEnv.Production;
}

export function readSessionCookie(request: Request): string | undefined {
  const header = request.headers.cookie;
  if (header === undefined) return undefined;
  const token = parse(header)[SESSION_COOKIE];
  return token === undefined || token === '' ? undefined : token;
}

export function setSessionCookie(
  response: Response,
  session: { token: string; expiresAt: Date },
  secure: boolean,
): void {
  response.cookie(SESSION_COOKIE, session.token, {
    ...cookieOptions(secure),
    expires: session.expiresAt,
  });
}

export function clearSessionCookie(response: Response, secure: boolean): void {
  response.clearCookie(SESSION_COOKIE, cookieOptions(secure));
}
