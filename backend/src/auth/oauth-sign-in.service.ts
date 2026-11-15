import { Inject, Injectable, Logger } from '@nestjs/common';

import { Clock } from '../common/clock.js';
import { TokenCipher } from '../common/crypto/token-cipher.js';
import { DEFAULT_LOCALE, LIMITS, type AuthProvider } from '../common/domain.js';
import { generateToken } from '../common/tokens.js';
import { DATABASE, type Database, type Transaction } from '../db/database.js';
import { UsersApi } from '../users/index.js';
import { AuthRepository } from './auth.repository.js';
import { safeNext } from './auth.rules.js';
import type { SignedIn } from './auth.service.js';
import type { OAuthQueryDto } from './dto/auth.dto.js';
import type { OAuthProfile } from './oauth/oauth-sign-in.js';
import { SignInProviders } from './oauth/sign-in-providers.js';
import { openSignInState, sealSignInState, type SignInIntent } from './oauth/sign-in-state.js';
import { SessionService } from './sessions.service.js';

export interface OAuthCallback {
  code: string | undefined;
  state: string | undefined;
  error: string | undefined;
}

interface Account {
  provider: AuthProvider;
  profile: OAuthProfile;
  intent: SignInIntent;
}

/** FR-07: sign in through an OAuth provider, creating the account or linking it by email */
@Injectable()
export class OAuthSignInService {
  private readonly logger = new Logger(OAuthSignInService.name);

  // oxlint-disable-next-line max-params -- Nest constructor injection: each parameter is a dependency, never a positional argument
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: AuthRepository,
    private readonly sessions: SessionService,
    private readonly users: UsersApi,
    private readonly providers: SignInProviders,
    private readonly cipher: TokenCipher,
    private readonly clock: Clock,
  ) {}

  /** null when the provider has no OAuth client configured */
  start(provider: AuthProvider, query: OAuthQueryDto): { url: string; nonce: string } | null {
    const oauth = this.providers.for(provider);
    if (!oauth.configured) return null;
    const nonce = generateToken();
    const intent: SignInIntent = {
      next: safeNext(query.next),
      ...(query.locale !== undefined && { locale: query.locale }),
      ...(query.timezone !== undefined && { timezone: query.timezone }),
    };
    const state = sealSignInState(this.cipher, provider, nonce, intent, this.clock.now());
    return { url: oauth.authUrl(state), nonce };
  }

  /** null for every failure: the caller sends the browser back to the login page */
  async complete(
    provider: AuthProvider,
    callback: OAuthCallback,
    nonce: string | undefined,
  ): Promise<{ signedIn: SignedIn; next: string } | null> {
    const { code, state, error } = callback;
    if (error !== undefined || code === undefined || state === undefined || nonce === undefined) {
      return null;
    }
    const intent = openSignInState(this.cipher, provider, { state, nonce }, this.clock.now());
    if (!intent) return null;
    try {
      const profile = await this.providers.for(provider).exchange(code);
      if (!profile.emailVerified) return null;
      const signedIn = await this.db.transaction((tx) =>
        this.signIn({ provider, profile, intent }, tx),
      );
      return signedIn ? { signedIn, next: intent.next } : null;
    } catch (cause) {
      this.logger.warn(`Sign-in with ${provider} failed: ${String(cause)}`);
      return null;
    }
  }

  private async signIn(account: Account, tx: Transaction): Promise<SignedIn | null> {
    const userId = await this.accountFor(account, tx);
    if (userId === null) return null;
    const user = await this.users.setProviderAvatar(userId, account.profile.picture, tx);
    if (!user) return null;
    return { user, session: await this.sessions.create(userId, tx) };
  }

  private async accountFor(
    { provider, profile, intent }: Account,
    tx: Transaction,
  ): Promise<string | null> {
    const now = this.clock.now();
    const email = profile.email.toLowerCase();
    const identity = await this.repository.findIdentity(provider, profile.subject, tx);
    if (identity) {
      await this.repository.touchIdentity(identity.id, email, now, tx);
      return identity.userId;
    }

    const existing = await this.users.findByEmail(email, tx);
    const userId = existing
      ? await this.link(provider, existing, tx)
      : await this.create(profile.name, email, intent, tx);
    if (userId === null) return null;
    await this.repository.insertIdentity(
      { userId, provider, providerUserId: profile.subject, email, lastUsedAt: now },
      tx,
    );
    return userId;
  }

  /**
   * The provider has proven the email. An unconfirmed account with it may belong to someone who
   * registered another person's address, so their password and sessions stop working.
   */
  private async link(
    provider: AuthProvider,
    user: { id: string; emailVerified: boolean },
    tx: Transaction,
  ): Promise<string | null> {
    // Already linked to another account of this provider
    if (await this.repository.hasIdentity(user.id, provider, tx)) return null;
    if (!user.emailVerified) {
      await this.repository.deletePassword(user.id, tx);
      await this.repository.deleteSessionsOfUser(user.id, null, tx);
      await this.users.markEmailVerified(user.id, this.clock.now(), tx);
    }
    return user.id;
  }

  private async create(
    providerName: string,
    email: string,
    intent: SignInIntent,
    tx: Transaction,
  ): Promise<string> {
    const name = providerName.trim().slice(0, LIMITS.userName);
    const user = await this.users.create(
      {
        name: name === '' ? (email.split('@')[0] ?? email) : name,
        email,
        locale: intent.locale ?? DEFAULT_LOCALE,
        ...(intent.timezone !== undefined && { timezone: intent.timezone }),
      },
      tx,
    );
    await this.users.markEmailVerified(user.id, this.clock.now(), tx);
    return user.id;
  }
}
