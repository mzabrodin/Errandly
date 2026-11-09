import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Clock } from '../common/clock.js';
import type { EmailTokenPurpose } from '../common/domain.js';
import { EventBus } from '../common/events/event-bus.js';
import { generateToken, hashToken } from '../common/tokens.js';
import type { EnvironmentVariables } from '../config/env.validation.js';
import { appLink } from '../config/urls.js';
import { DATABASE, type Database } from '../db/database.js';
import { MailService } from '../mail/index.js';
import { UsersApi } from '../users/index.js';
import { AuthRepository } from './auth.repository.js';
import { firstName, RESET_TOKEN_TTL_MS, VERIFY_TOKEN_TTL_MS } from './auth.rules.js';

/**
 * Verification and reset emails, sent after commit with retries (a mail failure never
 * undoes the registration: "лист зберігається для повторної спроби"). Each delivery issues
 * a fresh token and retires the older ones, so a retry needs no raw token stored anywhere.
 */
@Injectable()
export class AuthEmails implements OnModuleInit {
  private readonly appUrl: string;

  // oxlint-disable-next-line max-params -- Nest constructor injection: each parameter is a dependency, never a positional argument
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly repository: AuthRepository,
    private readonly users: UsersApi,
    private readonly mail: MailService,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.appUrl = config.get('APP_URL', { infer: true });
  }

  onModuleInit(): void {
    this.bus.onAfterCommit(
      'auth.emailVerificationRequested',
      'auth.sendVerificationEmail',
      ({ userId }) => this.sendVerification(userId),
    );
    this.bus.onAfterCommit(
      'auth.passwordResetRequested',
      'auth.sendPasswordResetEmail',
      ({ userId }) => this.sendPasswordReset(userId),
    );
  }

  async sendVerification(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    // Deleted or already confirmed meanwhile: nothing to send
    if (!user || user.emailVerified) return;
    const token = await this.issueToken(userId, 'verifyEmail', VERIFY_TOKEN_TTL_MS);
    await this.mail.send(
      'verifyEmail',
      user.email,
      { name: user.name, url: appLink(this.appUrl, '/verify-email', token) },
      user.locale,
    );
  }

  async sendPasswordReset(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) return;
    const token = await this.issueToken(userId, 'resetPassword', RESET_TOKEN_TTL_MS);
    await this.mail.send(
      'resetPassword',
      user.email,
      { name: firstName(user.name), url: appLink(this.appUrl, '/reset-password', token) },
      user.locale,
    );
  }

  private async issueToken(
    userId: string,
    purpose: EmailTokenPurpose,
    ttlMs: number,
  ): Promise<string> {
    const token = generateToken();
    const now = this.clock.now();
    await this.db.transaction(async (tx) => {
      await this.repository.retireEmailTokens(userId, purpose, now, tx);
      await this.repository.insertEmailToken(
        {
          userId,
          purpose,
          tokenHash: hashToken(token),
          expiresAt: new Date(now.getTime() + ttlMs),
        },
        tx,
      );
    });
    return token;
  }
}
