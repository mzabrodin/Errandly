import { generateToken, hashToken } from '../common/tokens.js';
import {
  afterFailedLogin,
  firstName,
  LOCKOUT_MS,
  lockRemainingSeconds,
  MAX_FAILED_LOGINS,
  SESSION_REFRESH_MS,
  SESSION_TTL_MS,
  sessionExpiry,
  shouldRefreshSession,
} from './auth.rules.js';

const now = new Date('2026-11-09T12:00:00.000Z');
const at = (ms: number) => new Date(now.getTime() + ms);

describe('auth rules', () => {
  describe('lockout (FR-06)', () => {
    it('counts failures below the limit', () => {
      expect(afterFailedLogin(0, now)).toEqual({ failedLogins: 1, lockedUntil: null });
      expect(afterFailedLogin(3, now)).toEqual({ failedLogins: 4, lockedUntil: null });
    });

    it('locks for 15 minutes on the 5th failure and resets the counter', () => {
      expect(MAX_FAILED_LOGINS).toBe(5);
      expect(afterFailedLogin(4, now)).toEqual({
        failedLogins: 0,
        lockedUntil: at(15 * 60 * 1000),
      });
    });

    it('reports the remaining lock time in whole seconds, rounded up', () => {
      expect(lockRemainingSeconds(at(LOCKOUT_MS), now)).toBe(900);
      expect(lockRemainingSeconds(at(1500), now)).toBe(2);
    });

    it('treats a missing or past lock as unlocked', () => {
      expect(lockRemainingSeconds(null, now)).toBeNull();
      expect(lockRemainingSeconds(now, now)).toBeNull();
      expect(lockRemainingSeconds(at(-1), now)).toBeNull();
    });
  });

  describe('sessions', () => {
    it('expire 30 days after the last use', () => {
      expect(sessionExpiry(now)).toEqual(at(SESSION_TTL_MS));
      expect(SESSION_TTL_MS).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it('slide at most once an hour', () => {
      expect(shouldRefreshSession(at(-SESSION_REFRESH_MS + 1), now)).toBe(false);
      expect(shouldRefreshSession(at(-SESSION_REFRESH_MS), now)).toBe(true);
    });
  });

  describe('tokens (SYS-24)', () => {
    it('are random, URL-safe and at least 128 bits', () => {
      const token = generateToken();

      expect(token).toMatch(/^[\w-]{43}$/);
      expect(generateToken()).not.toBe(token);
    });

    it('are stored as a SHA-256 hex digest', () => {
      expect(hashToken('abc')).toBe(
        'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
      );
    });
  });

  it('greets by the first word of the name', () => {
    expect(firstName('  Anya Kovalenko ')).toBe('Anya');
    expect(firstName('Oleh')).toBe('Oleh');
  });
});
