import { addMs, DAY_MS, HOUR_MS, MINUTE_MS } from '../common/time.js';

/** NFR-SEC-03: sliding, from the last use */
export const SESSION_TTL_MS = 30 * DAY_MS;
/** Not on every request, to spare writes */
export const SESSION_REFRESH_MS = HOUR_MS;

/** FR-06: the 5th failed sign-in in a row locks the account for 15 minutes, whatever the IP */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MS = 15 * MINUTE_MS;

/** NFR-SEC-08: a reset link works for 1 hour and only once */
export const RESET_TOKEN_TTL_MS = HOUR_MS;
/** Verification links are single use too, and last two days */
export const VERIFY_TOKEN_TTL_MS = 2 * DAY_MS;

export interface LoginAttempts {
  failedLogins: number;
  lockedUntil: Date | null;
}

export function lockRemainingSeconds(lockedUntil: Date | null, now: Date): number | null {
  if (lockedUntil === null || lockedUntil <= now) return null;
  return Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
}

/** `failures` already counts this attempt; a lock also resets the counter */
export function lockAfter(failures: number, now: Date): LoginAttempts | null {
  return failures >= MAX_FAILED_LOGINS
    ? { failedLogins: 0, lockedUntil: addMs(now, LOCKOUT_MS) }
    : null;
}

export function sessionExpiry(now: Date): Date {
  return addMs(now, SESSION_TTL_MS);
}

export function shouldRefreshSession(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= SESSION_REFRESH_MS;
}

/**
 * Only a path inside the app, never another site (`//evil.com`, `/\evil.com`, `https://…`).
 * Printable ASCII only: browsers drop tabs and newlines, so `/\t/evil.com` would become `//evil.com`.
 */
export function safeNext(next: string | undefined): string {
  return next !== undefined && /^\/(?![/\\])[\x21-\x7e]*$/.test(next) ? next : '/';
}
