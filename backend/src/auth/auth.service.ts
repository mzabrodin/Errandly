import { Inject, Injectable } from '@nestjs/common';

import { Clock } from '../common/clock.js';
import { DEFAULT_LOCALE } from '../common/domain.js';
import { DomainError } from '../common/errors/domain-error.js';
import { EventBus } from '../common/events/event-bus.js';
import type { RequestUser } from '../common/http/auth.js';
import { hashToken } from '../common/tokens.js';
import { DATABASE, type Database } from '../db/database.js';
import { UsersApi, type UserDto } from '../users/index.js';
import { AuthRepository } from './auth.repository.js';
import { afterFailedLogin, lockRemainingSeconds } from './auth.rules.js';
import type { LoginDto, RegisterDto } from './dto/auth.dto.js';
import { PasswordHasher } from './password-hasher.js';
import { SessionService, type IssuedSession } from './sessions.service.js';

export interface SignedIn {
  user: UserDto;
  session: IssuedSession;
}

/** Sign-up, sign-in and credentials (FR-01–09, SD-0); emails go out through AuthEmails */
@Injectable()
export class AuthService {
  /** Hashed once, then verified against for unknown emails so they take as long as known ones */
  private dummyHash: Promise<string> | undefined;

  // oxlint-disable-next-line max-params -- Nest constructor injection: each parameter is a dependency, never a positional argument
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: AuthRepository,
    private readonly sessions: SessionService,
    private readonly users: UsersApi,
    private readonly hasher: PasswordHasher,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async me(userId: string): Promise<UserDto> {
    const user = await this.users.findById(userId);
    if (!user) throw new DomainError('UNAUTHENTICATED');
    return user;
  }

  /** Creates the account and signs it in; the verification email follows after commit */
  async register(input: RegisterDto): Promise<SignedIn> {
    const passwordHash = await this.hasher.hash(input.password);
    return this.db.transaction(async (tx) => {
      const user = await this.users.create(
        {
          name: input.name,
          email: input.email,
          locale: input.locale ?? DEFAULT_LOCALE,
          ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
        },
        tx,
      );
      await this.repository.savePassword(user.id, passwordHash, tx);
      await this.bus.publish(tx, 'auth.emailVerificationRequested', { userId: user.id });
      const session = await this.sessions.create(user.id, tx);
      return { user, session };
    });
  }

  /** FR-05–06: a locked account answers 423 even to the right password */
  async login(input: LoginDto): Promise<SignedIn> {
    const user = await this.users.findByEmail(input.email);
    const credentials = user ? await this.repository.findCredentials(user.id) : undefined;
    if (!user || !credentials) {
      await this.hasher.verify(input.password, await this.getDummyHash());
      throw new DomainError('INVALID_CREDENTIALS');
    }

    const now = this.clock.now();
    const lockedFor = lockRemainingSeconds(credentials.lockedUntil, now);
    if (lockedFor !== null) {
      throw new DomainError('ACCOUNT_LOCKED', { retryAfterSeconds: lockedFor });
    }

    if (!(await this.hasher.verify(input.password, credentials.passwordHash))) {
      const attempts = afterFailedLogin(credentials.failedLogins, now);
      await this.repository.saveLoginAttempts(user.id, attempts);
      const lockedNow = lockRemainingSeconds(attempts.lockedUntil, now);
      if (lockedNow !== null) {
        throw new DomainError('ACCOUNT_LOCKED', { retryAfterSeconds: lockedNow });
      }
      throw new DomainError('INVALID_CREDENTIALS');
    }

    if (credentials.failedLogins > 0 || credentials.lockedUntil !== null) {
      await this.repository.saveLoginAttempts(user.id, { failedLogins: 0, lockedUntil: null });
    }
    return { user, session: await this.sessions.create(user.id) };
  }

  logout(token: string | undefined): Promise<void> {
    return this.sessions.revoke(token);
  }

  /** "Send again": a no-op once the email is confirmed */
  async requestEmailVerification(userId: string): Promise<void> {
    const user = await this.me(userId);
    if (user.emailVerified) return;
    await this.db.transaction((tx) =>
      this.bus.publish(tx, 'auth.emailVerificationRequested', { userId }),
    );
  }

  /** FR-04: confirms the email from a single-use link; works without a session */
  async verifyEmail(token: string): Promise<UserDto> {
    const now = this.clock.now();
    return this.db.transaction(async (tx) => {
      const userId = await this.repository.consumeEmailToken(
        hashToken(token),
        'verifyEmail',
        now,
        tx,
      );
      const user = userId === null ? null : await this.users.markEmailVerified(userId, now, tx);
      if (!user) throw new DomainError('TOKEN_INVALID');
      return user;
    });
  }

  /** FR-08: always succeeds, so the answer does not reveal whether an account exists */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findByEmail(email);
    if (!user) return;
    await this.db.transaction((tx) =>
      this.bus.publish(tx, 'auth.passwordResetRequested', { userId: user.id }),
    );
  }

  /** NFR-SEC-08: the link works once, within an hour; every session ends, the lock is lifted */
  async resetPassword(token: string, password: string): Promise<void> {
    const passwordHash = await this.hasher.hash(password);
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      const userId = await this.repository.consumeEmailToken(
        hashToken(token),
        'resetPassword',
        now,
        tx,
      );
      if (userId === null) throw new DomainError('TOKEN_INVALID');
      await this.repository.savePassword(userId, passwordHash, tx);
      await this.sessions.revokeAll(userId, null, tx);
    });
  }

  /** Other devices are signed out; the session making the change stays */
  async changePassword(user: RequestUser, current: string, next: string): Promise<void> {
    const credentials = await this.repository.findCredentials(user.id);
    if (!credentials || !(await this.hasher.verify(current, credentials.passwordHash))) {
      throw new DomainError('WRONG_PASSWORD');
    }
    const passwordHash = await this.hasher.hash(next);
    await this.db.transaction(async (tx) => {
      await this.repository.savePassword(user.id, passwordHash, tx);
      await this.sessions.revokeAll(user.id, user.sessionId, tx);
    });
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash('timing-equaliser-1');
    return this.dummyHash;
  }
}
