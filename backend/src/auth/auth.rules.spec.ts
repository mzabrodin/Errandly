import { generateToken, hashToken } from '../common/tokens.js';
import {
  lockAfter,
  LOCKOUT_MS,
  lockRemainingSeconds,
  MAX_FAILED_LOGINS,
  safeNext,
  SESSION_REFRESH_MS,
  SESSION_TTL_MS,
  sessionExpiry,
  shouldRefreshSession,
} from './auth.rules.js';

const now = new Date('2026-11-09T12:00:00.000Z');
const at = (ms: number) => new Date(now.getTime() + ms);

describe('auth rules', () => {
  describe('lockout (FR-06)', () => {
    it('does not lock below the limit', () => {
      expect(lockAfter(1, now)).toBeNull();
      expect(lockAfter(4, now)).toBeNull();
    });

    it('locks for 15 minutes from the 5th failure and resets the counter', () => {
      expect(MAX_FAILED_LOGINS).toBe(5);
      const lock = { failedLogins: 0, lockedUntil: at(15 * 60 * 1000) };
      expect(lockAfter(5, now)).toEqual(lock);
      // A parallel attempt that counted past the limit
      expect(lockAfter(6, now)).toEqual(lock);
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

  describe('the return path after an OAuth sign-in', () => {
    it.each(['/', '/g/1/tasks', '/invite/abc?x=1#top'])('keeps the app path %s', (path) => {
      expect(safeNext(path)).toBe(path);
    });

    it.each([
      undefined,
      '',
      'https://evil.com',
      '//evil.com',
      '/\\evil.com',
      '/\t/evil.com',
      'g/1',
      '/шлях',
    ])('sends %j to the start page', (path) => {
      expect(safeNext(path)).toBe('/');
    });
  });
});
