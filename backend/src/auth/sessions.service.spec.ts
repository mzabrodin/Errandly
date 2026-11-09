import { FixedClock } from '../common/clock.js';
import { hashToken } from '../common/tokens.js';
import type { AuthRepository } from './auth.repository.js';
import { SESSION_TTL_MS } from './auth.rules.js';
import { SessionService } from './sessions.service.js';

interface Row {
  id: string;
  userId: string;
  expiresAt: Date;
  lastSeenAt: Date;
}

class FakeRepository {
  rows = new Map<string, Row>();

  insertSession(row: Row) {
    this.rows.set(row.id, row);
    return Promise.resolve();
  }

  findSession(id: string) {
    return Promise.resolve(this.rows.get(id));
  }

  touchSession(id: string, lastSeenAt: Date, expiresAt: Date) {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, lastSeenAt, expiresAt });
    return Promise.resolve();
  }

  deleteSession(id: string) {
    this.rows.delete(id);
    return Promise.resolve();
  }

  deleteSessionsOfUser(userId: string, keepId: string | null) {
    for (const [id, row] of this.rows) {
      if (row.userId === userId && id !== keepId) this.rows.delete(id);
    }
    return Promise.resolve();
  }
}

const HOUR = 60 * 60 * 1000;

function setup() {
  const repository = new FakeRepository();
  const clock = new FixedClock('2026-11-09T12:00:00.000Z');
  const sessions = new SessionService(repository as unknown as AuthRepository, clock);
  return { repository, clock, sessions };
}

describe('SessionService', () => {
  it('stores only the hash of the token it hands out', async () => {
    const { repository, sessions, clock } = setup();

    const { token, expiresAt } = await sessions.create('u1');

    expect(repository.rows.has(token)).toBe(false);
    expect(repository.rows.get(hashToken(token))).toMatchObject({ userId: 'u1', expiresAt });
    expect(expiresAt.getTime() - clock.now().getTime()).toBe(SESSION_TTL_MS);
  });

  it('authenticates a valid token and ignores missing or unknown ones', async () => {
    const { sessions } = setup();
    const { token } = await sessions.create('u1');

    await expect(sessions.authenticate(token)).resolves.toEqual({
      user: { id: 'u1', sessionId: hashToken(token) },
      refreshed: null,
    });
    await expect(sessions.authenticate(undefined)).resolves.toBeNull();
    await expect(sessions.authenticate('forged')).resolves.toBeNull();
  });

  it('slides the expiry after an hour of use', async () => {
    const { sessions, clock, repository } = setup();
    const { token, expiresAt } = await sessions.create('u1');

    clock.advance(2 * HOUR);
    const result = await sessions.authenticate(token);

    expect(result?.refreshed?.expiresAt.getTime()).toBe(expiresAt.getTime() + 2 * HOUR);
    expect(repository.rows.get(hashToken(token))?.lastSeenAt).toEqual(clock.now());
  });

  it('deletes an expired session', async () => {
    const { sessions, clock, repository } = setup();
    const { token } = await sessions.create('u1');

    clock.advance(SESSION_TTL_MS);

    await expect(sessions.authenticate(token)).resolves.toBeNull();
    expect(repository.rows.size).toBe(0);
  });

  it('revokes one session or all but one', async () => {
    const { sessions, repository } = setup();
    const a = await sessions.create('u1');
    const b = await sessions.create('u1');
    const c = await sessions.create('u1');

    await sessions.revoke(a.token);
    await sessions.revoke(undefined);
    expect(repository.rows.size).toBe(2);

    await sessions.revokeAll('u1', hashToken(b.token));
    expect([...repository.rows.keys()]).toEqual([hashToken(b.token)]);
    expect(repository.rows.has(hashToken(c.token))).toBe(false);
  });
});
