import type { ConfigService } from '@nestjs/config';

import { FixedClock } from '../common/clock.js';
import { TokenCipher } from '../common/crypto/token-cipher.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import type { Database } from '../db/database.js';
import type { UserDto, UsersApi } from '../users/index.js';
import type { AuthRepository } from './auth.repository.js';
import { OAuthSignInService } from './oauth-sign-in.service.js';
import { OAuthSignIn, type OAuthProfile } from './oauth/oauth-sign-in.js';
import type { SignInProviders } from './oauth/sign-in-providers.js';
import type { SessionService } from './sessions.service.js';

// In-memory stand-ins; test/oauth-sign-in.int-spec.ts runs the same flows on PostgreSQL

const NOW = new Date('2026-11-15T10:00:00.000Z');
const PROFILE: OAuthProfile = {
  subject: 'g-1',
  email: 'Anya@Gmail.com',
  emailVerified: true,
  name: 'Anya Kovalenko',
  picture: 'https://photo',
};

class FakeProvider extends OAuthSignIn {
  readonly provider = 'google';
  configured = true;
  profile: OAuthProfile = PROFILE;
  lastState = '';

  authUrl(state: string): string {
    this.lastState = state;
    return 'https://google/consent';
  }

  exchange(code: string): Promise<OAuthProfile> {
    return code === 'bad'
      ? Promise.reject(new Error('invalid_grant'))
      : Promise.resolve(this.profile);
  }
}

class FakeRepository {
  identities: { id: string; userId: string; subject: string; email: string }[] = [];
  passwords = new Set<string>();
  sessionsDeletedFor: string[] = [];

  findIdentity(_provider: string, subject: string) {
    return Promise.resolve(this.identities.find((identity) => identity.subject === subject));
  }

  hasIdentity(userId: string) {
    return Promise.resolve(this.identities.some((identity) => identity.userId === userId));
  }

  insertIdentity(identity: { userId: string; providerUserId: string; email: string }) {
    this.identities.push({
      id: `i${this.identities.length + 1}`,
      userId: identity.userId,
      subject: identity.providerUserId,
      email: identity.email,
    });
    return Promise.resolve();
  }

  touchIdentity(id: string, email: string) {
    const identity = this.identities.find((candidate) => candidate.id === id);
    if (identity) identity.email = email;
    return Promise.resolve();
  }

  deletePassword(userId: string) {
    this.passwords.delete(userId);
    return Promise.resolve();
  }

  deleteSessionsOfUser(userId: string) {
    this.sessionsDeletedFor.push(userId);
    return Promise.resolve();
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

  findByEmail(email: string) {
    return Promise.resolve([...this.users.values()].find((user) => user.email === email) ?? null);
  }

  create(user: { name: string; email: string; locale: 'uk' | 'en'; timezone?: string }) {
    return Promise.resolve(
      this.add({ id: `u${this.users.size + 1}`, emailVerified: false, ...user }),
    );
  }

  markEmailVerified(id: string) {
    const user = this.users.get(id);
    if (user) user.emailVerified = true;
    return Promise.resolve(user ?? null);
  }

  setProviderAvatar(id: string, url: string | null) {
    const user = this.users.get(id);
    if (user) user.avatarUrl = url;
    return Promise.resolve(user ?? null);
  }
}

function setup() {
  const provider = new FakeProvider();
  const repository = new FakeRepository();
  const users = new FakeUsers();
  const sessions = {
    create: (userId: string) => Promise.resolve({ token: `t-${userId}`, expiresAt: NOW }),
  };
  const config = {
    get: () => Buffer.alloc(32, 5).toString('base64'),
  } as unknown as ConfigService<EnvironmentVariables, true>;
  const service = new OAuthSignInService(
    { transaction: <T>(work: (tx: unknown) => Promise<T>) => work('tx') } as unknown as Database,
    repository as unknown as AuthRepository,
    sessions as unknown as SessionService,
    users as unknown as UsersApi,
    { for: () => provider } as unknown as SignInProviders,
    new TokenCipher(config),
    new FixedClock(NOW),
  );

  /** Start, consent on Google, come back with the same browser */
  const signIn = async (code = 'code', query = {}) => {
    const flow = service.start('google', { next: '/g/1', ...query });
    if (!flow) throw new Error('not configured');
    return service.complete(
      'google',
      { code, state: provider.lastState, error: undefined },
      flow.nonce,
    );
  };
  return { service, provider, repository, users, signIn };
}

describe('OAuthSignInService', () => {
  it('creates a confirmed account with the UI language, time zone and photo', async () => {
    const { signIn, users, repository } = setup();

    const result = await signIn('code', { locale: 'en', timezone: 'America/New_York' });

    expect(result?.next).toBe('/g/1');
    expect(result?.signedIn.user).toMatchObject({
      name: 'Anya Kovalenko',
      email: 'anya@gmail.com',
      emailVerified: true,
      locale: 'en',
      timezone: 'America/New_York',
      avatarUrl: 'https://photo',
    });
    expect(repository.identities).toEqual([
      { id: 'i1', userId: 'u1', subject: 'g-1', email: 'anya@gmail.com' },
    ]);
    expect(users.users.size).toBe(1);
  });

  it('signs the same Google account into the same user, whatever its email is now', async () => {
    const { signIn, provider, users } = setup();
    await signIn();
    provider.profile = { ...PROFILE, email: 'new@gmail.com' };

    expect((await signIn())?.signedIn.user.id).toBe('u1');
    expect(users.users.size).toBe(1);
  });

  it('names the account after the email when the provider gives no name', async () => {
    const { signIn, provider } = setup();
    provider.profile = { ...PROFILE, name: '  ' };

    expect((await signIn())?.signedIn.user.name).toBe('anya');
  });

  it('links a confirmed password account and keeps its password', async () => {
    const { signIn, users, repository } = setup();
    users.add({ id: 'p1', email: 'anya@gmail.com' });
    repository.passwords.add('p1');

    expect((await signIn())?.signedIn.user.id).toBe('p1');
    expect(repository.passwords.has('p1')).toBe(true);
    expect(repository.sessionsDeletedFor).toEqual([]);
  });

  it("locks a squatter out of an unconfirmed account with the owner's email", async () => {
    const { signIn, users, repository } = setup();
    users.add({ id: 'p1', email: 'anya@gmail.com', emailVerified: false });
    repository.passwords.add('p1');

    expect((await signIn())?.signedIn.user).toMatchObject({ id: 'p1', emailVerified: true });
    expect(repository.passwords.has('p1')).toBe(false);
    expect(repository.sessionsDeletedFor).toEqual(['p1']);
  });

  it('refuses a second Google account for a user who already has one', async () => {
    const { signIn, users, repository } = setup();
    users.add({ id: 'p1', email: 'anya@gmail.com' });
    repository.identities.push({ id: 'i0', userId: 'p1', subject: 'g-other', email: 'x' });

    expect(await signIn()).toBeNull();
  });

  it('refuses an unverified email, a failed exchange, a cancel and a missing cookie', async () => {
    const world = setup();
    world.provider.profile = { ...PROFILE, emailVerified: false };
    expect(await world.signIn()).toBeNull();

    expect(await setup().signIn('bad')).toBeNull();

    const { service, provider } = setup();
    const flow = service.start('google', {});
    const callback = { code: 'code', state: provider.lastState, error: undefined };
    expect(
      await service.complete('google', { ...callback, error: 'access_denied' }, flow?.nonce),
    ).toBeNull();
    expect(await service.complete('google', callback, undefined)).toBeNull();
  });

  it('cannot start without a configured OAuth client', () => {
    const { service, provider } = setup();
    provider.configured = false;

    expect(service.start('google', {})).toBeNull();
  });
});
