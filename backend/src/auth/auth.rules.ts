// Auth invariants as pure functions and constants; services apply them, tests pin them down.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A session lives this long after its last use (NFR-SEC-03: tokens with a limited lifetime) */
export const SESSION_TTL_MS = 30 * DAY_MS;
/** Sliding expiry is written at most this often, not on every request */
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

/** Whole seconds until the lock ends, or null when the account is not locked */
export function lockRemainingSeconds(lockedUntil: Date | null, now: Date): number | null {
  if (lockedUntil === null || lockedUntil <= now) return null;
  return Math.ceil((lockedUntil.getTime() - now.getTime()) / 1000);
}

/** The counter after one more wrong password; reaching the limit locks and starts over */
export function afterFailedLogin(failedLogins: number, now: Date): LoginAttempts {
  const failures = failedLogins + 1;
  if (failures >= MAX_FAILED_LOGINS) {
    return { failedLogins: 0, lockedUntil: new Date(now.getTime() + LOCKOUT_MS) };
  }
  return { failedLogins: failures, lockedUntil: null };
}

export function sessionExpiry(now: Date): Date {
  return new Date(now.getTime() + SESSION_TTL_MS);
}

export function shouldRefreshSession(lastSeenAt: Date, now: Date): boolean {
  return now.getTime() - lastSeenAt.getTime() >= SESSION_REFRESH_MS;
}

/** The greeting name in emails: the first word of the profile name */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
