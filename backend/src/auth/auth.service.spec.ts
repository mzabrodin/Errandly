import { FixedClock } from '../common/clock.js';
import type { EmailTokenPurpose } from '../common/domain.js';
import { DomainError } from '../common/errors/domain-error.js';
import type { EventBus } from '../common/events/event-bus.js';
import { hashToken } from '../common/tokens.js';
import type { Database } from '../db/database.js';
import type { UserDto, UsersApi } from '../users/index.js';
import type { AuthRepository } from './auth.repository.js';
import type { LoginAttempts } from './auth.rules.js';
import { AuthService } from './auth.service.js';
import type { SessionService } from './sessions.service.js';

// In-memory stand-ins for the database-facing collaborators; the integration tests cover the real ones

const NOW = new Date('2026-11-09T12:00:00.000Z');

interface Credentials extends LoginAttempts {
  passwordHash: string;
}

interface Token {
  userId: string;
  purpose: EmailTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

class FakeRepository {
  credentials = new Map<string, Credentials>();
  tokens: Token[] = [];

  findCredentials(userId: string) {
    return Promise.resolve(this.credentials.get(userId));
  }

  savePassword(userId: string, passwordHash: string) {
    this.credentials.set(userId, { passwordHash, failedLogins: 0, lockedUntil: null });
    return Promise.resolve();
  }

  saveLoginAttempts(userId: string, attempts: LoginAttempts) {
    const current = this.credentials.get(userId);
    if (current) this.credentials.set(userId, { ...current, ...attempts });
    return Promise.resolve();
  }

  consumeEmailToken(tokenHash: string, purpose: EmailTokenPurpose, now: Date) {
    const token = this.tokens.find(
      (t) =>
        t.tokenHash === tokenHash &&
        t.purpose === purpose &&
        t.usedAt === null &&
        t.expiresAt > now,
    );
    if (token) token.usedAt = now;
    return Promise.resolve(token?.userId ?? null);
  }
}

class FakeUsers {
  users = new Map<string, UserDto>();

  add(user: Partial<UserDto> & { id: string; email: string }): UserDto {
    const dto: UserDto = {
      name: 'Anya',
      emailVerified: true,
      timezone: 'Europe/Kyiv',
      timezoneAuto: true,
      locale: 'uk',
      avatarUrl: null,
      ...user,
    };
    this.users.set(dto.id, dto);
    return dto;
  }

  findById(id: string) {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  findByEmail(email: string) {
    return Promise.resolve([...this.users.values()].find((u) => u.email === email) ?? null);
  }

  create(user: { name: string; email: string; locale: 'uk' | 'en'; timezone?: string }) {
    if ([...this.users.values()].some((u) => u.email === user.email)) {
      return Promise.reject(new DomainError('EMAIL_TAKEN'));
    }
    return Promise.resolve(
      this.add({ id: `u${this.users.size + 1}`, emailVerified: false, ...user }),
    );
  }

  markEmailVerified(id: string) {
    const user = this.users.get(id);
    if (user) user.emailVerified = true;
    return Promise.resolve(user ?? null);
  }
}

const hasher = {
  hash: (password: string) => Promise.resolve(`hash:${password}`),
  verify: (password: string, stored: string) => Promise.resolve(stored === `hash:${password}`),
};

class FakeSessions {
  created: string[] = [];
  revoked: (string | undefined)[] = [];
  revokedAll: [string, string | null][] = [];

  create(userId: string) {
    this.created.push(userId);
    return Promise.resolve({ token: `token-${userId}`, expiresAt: NOW });
  }

  revoke(token: string | undefined) {
    this.revoked.push(token);
    return Promise.resolve();
  }

  revokeAll(userId: string, keepId: string | null) {
    this.revokedAll.push([userId, keepId]);
    return Promise.resolve();
  }
}

class FakeBus {
  published: [string, unknown][] = [];

  publish(_tx: unknown, type: string, event: unknown) {
    this.published.push([type, event]);
    return Promise.resolve();
  }
}

function setup() {
  const repository = new FakeRepository();
  const users = new FakeUsers();
  const sessions = new FakeSessions();
  const bus = new FakeBus();
  const clock = new FixedClock(NOW);
  const db = { transaction: <T>(work: (tx: unknown) => Promise<T>) => work('tx') };
  const service = new AuthService(
    db as unknown as Database,
    repository as unknown as AuthRepository,
    sessions as unknown as SessionService,
    users as unknown as UsersApi,
    hasher,
    bus as unknown as EventBus,
    clock,
  );
  return { service, repository, users, sessions, bus, clock };
}

function withUser(attempts: Partial<LoginAttempts> = {}) {
  const world = setup();
  world.users.add({ id: 'u1', email: 'anya@errandly.test' });
  world.repository.credentials.set('u1', {
    passwordHash: 'hash:Pass1234',
    failedLogins: 0,
    lockedUntil: null,
    ...attempts,
  });
  return world;
}

describe('AuthService', () => {
  describe('register', () => {
    it('creates the user and password, asks for verification and opens a session', async () => {
      const { service, repository, sessions, bus } = setup();

      const { user, session } = await service.register({
        name: 'Anya',
        email: 'anya@errandly.test',
        password: 'Pass1234',
        locale: 'en',
        timezone: 'America/New_York',
      });

      expect(user).toMatchObject({
        email: 'anya@errandly.test',
        locale: 'en',
        timezone: 'America/New_York',
      });
      expect(repository.credentials.get(user.id)?.passwordHash).toBe('hash:Pass1234');
      expect(bus.published).toEqual([['auth.emailVerificationRequested', { userId: user.id }]]);
      expect(sessions.created).toEqual([user.id]);
      expect(session.token).toBe(`token-${user.id}`);
    });

    it('defaults the language to Ukrainian', async () => {
      const { service } = setup();

      const { user } = await service.register({
        name: 'Oleh',
        email: 'oleh@errandly.test',
        password: 'Pass1234',
      });

      expect(user.locale).toBe('uk');
    });
  });

  describe('login', () => {
    it('signs in with the right password and clears earlier failures', async () => {
      const { service, repository } = withUser({ failedLogins: 3 });

      const { user } = await service.login({ email: 'anya@errandly.test', password: 'Pass1234' });

      expect(user.id).toBe('u1');
      expect(repository.credentials.get('u1')).toMatchObject({
        failedLogins: 0,
        lockedUntil: null,
      });
    });

    it('answers INVALID_CREDENTIALS to an unknown email or a user without a password', async () => {
      const { service, users } = setup();
      users.add({ id: 'u2', email: 'google@errandly.test' });

      await expect(
        service.login({ email: 'nobody@errandly.test', password: 'Pass1234' }),
      ).rejects.toEqual(new DomainError('INVALID_CREDENTIALS'));
      await expect(
        service.login({ email: 'google@errandly.test', password: 'Pass1234' }),
      ).rejects.toEqual(new DomainError('INVALID_CREDENTIALS'));
    });

    it('locks on the 5th wrong password', async () => {
      const { service } = withUser({ failedLogins: 4 });

      await expect(
        service.login({ email: 'anya@errandly.test', password: 'Wrong1234' }),
      ).rejects.toEqual(new DomainError('ACCOUNT_LOCKED', { retryAfterSeconds: 900 }));
    });

    it('refuses even the right password while locked', async () => {
      const { service } = withUser({ lockedUntil: new Date(NOW.getTime() + 60_000) });

      await expect(
        service.login({ email: 'anya@errandly.test', password: 'Pass1234' }),
      ).rejects.toEqual(new DomainError('ACCOUNT_LOCKED', { retryAfterSeconds: 60 }));
    });
  });

  it('ends the session on logout', async () => {
    const { service, sessions } = setup();

    await service.logout('abc');

    expect(sessions.revoked).toEqual(['abc']);
  });

  it('answers UNAUTHENTICATED for a session whose user is gone', async () => {
    await expect(setup().service.me('gone')).rejects.toEqual(new DomainError('UNAUTHENTICATED'));
  });

  describe('email verification', () => {
    it('asks for a new email only while unverified', async () => {
      const { service, users, bus } = setup();
      users.add({ id: 'u1', email: 'a@errandly.test', emailVerified: false });
      users.add({ id: 'u2', email: 'b@errandly.test', emailVerified: true });

      await service.requestEmailVerification('u1');
      await service.requestEmailVerification('u2');

      expect(bus.published).toEqual([['auth.emailVerificationRequested', { userId: 'u1' }]]);
    });

    it('verifies with a valid token and refuses it the second time', async () => {
      const { service, users, repository } = setup();
      users.add({ id: 'u1', email: 'a@errandly.test', emailVerified: false });
      repository.tokens.push({
        userId: 'u1',
        purpose: 'verifyEmail',
        tokenHash: hashToken('t1'),
        expiresAt: new Date(NOW.getTime() + 1000),
        usedAt: null,
      });

      await expect(service.verifyEmail('t1')).resolves.toMatchObject({ emailVerified: true });
      await expect(service.verifyEmail('t1')).rejects.toEqual(new DomainError('TOKEN_INVALID'));
    });
  });

  describe('password reset', () => {
    it('asks for a reset email only for an existing account', async () => {
      const { service, users, bus } = setup();
      users.add({ id: 'u1', email: 'a@errandly.test' });

      await service.forgotPassword('a@errandly.test');
      await service.forgotPassword('nobody@errandly.test');

      expect(bus.published).toEqual([['auth.passwordResetRequested', { userId: 'u1' }]]);
    });

    it('sets the password and signs out everywhere', async () => {
      const { service, repository, sessions } = setup();
      repository.tokens.push({
        userId: 'u1',
        purpose: 'resetPassword',
        tokenHash: hashToken('r1'),
        expiresAt: new Date(NOW.getTime() + 1000),
        usedAt: null,
      });

      await service.resetPassword('r1', 'NewPass123');

      expect(repository.credentials.get('u1')?.passwordHash).toBe('hash:NewPass123');
      expect(sessions.revokedAll).toEqual([['u1', null]]);
    });

    it('refuses an expired or wrong-purpose token', async () => {
      const { service, repository } = setup();
      repository.tokens.push(
        {
          userId: 'u1',
          purpose: 'resetPassword',
          tokenHash: hashToken('old'),
          expiresAt: NOW,
          usedAt: null,
        },
        {
          userId: 'u1',
          purpose: 'verifyEmail',
          tokenHash: hashToken('verify'),
          expiresAt: new Date(NOW.getTime() + 1000),
          usedAt: null,
        },
      );

      await expect(service.resetPassword('old', 'NewPass123')).rejects.toEqual(
        new DomainError('TOKEN_INVALID'),
      );
      await expect(service.resetPassword('verify', 'NewPass123')).rejects.toEqual(
        new DomainError('TOKEN_INVALID'),
      );
    });
  });

  describe('change password', () => {
    it('keeps the current session and ends the others', async () => {
      const { service, repository, sessions } = setup();
      await repository.savePassword('u1', 'hash:Pass1234');

      await service.changePassword({ id: 'u1', sessionId: 's1' }, 'Pass1234', 'NewPass123');

      expect(repository.credentials.get('u1')?.passwordHash).toBe('hash:NewPass123');
      expect(sessions.revokedAll).toEqual([['u1', 's1']]);
    });

    it('needs the current password', async () => {
      const { service, repository } = setup();
      await repository.savePassword('u1', 'hash:Pass1234');

      await expect(
        service.changePassword({ id: 'u1', sessionId: 's1' }, 'Wrong1234', 'NewPass123'),
      ).rejects.toEqual(new DomainError('WRONG_PASSWORD'));
      await expect(
        service.changePassword({ id: 'u2', sessionId: 's2' }, 'Pass1234', 'NewPass123'),
      ).rejects.toEqual(new DomainError('WRONG_PASSWORD'));
    });
  });
});
