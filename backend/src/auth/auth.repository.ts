import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, isNull, ne } from 'drizzle-orm';

import type { EmailTokenPurpose } from '../common/domain.js';
import { DATABASE, type Database, type DbExecutor } from '../db/database.js';
import type { LoginAttempts } from './auth.rules.js';
import {
  emailTokens,
  passwordCredentials,
  sessions,
  type PasswordCredentialsRow,
  type SessionRow,
} from './auth.schema.js';

export interface NewEmailToken {
  userId: string;
  purpose: EmailTokenPurpose;
  tokenHash: string;
  expiresAt: Date;
}

/** The only place that queries the auth tables */
@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // Credentials

  async findCredentials(
    userId: string,
    db: DbExecutor = this.db,
  ): Promise<PasswordCredentialsRow | undefined> {
    const [row] = await db
      .select()
      .from(passwordCredentials)
      .where(eq(passwordCredentials.userId, userId))
      .limit(1);
    return row;
  }

  /** Sets the password (creating the row for accounts without one) and clears any lockout */
  async savePassword(
    userId: string,
    passwordHash: string,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db
      .insert(passwordCredentials)
      .values({ userId, passwordHash })
      .onConflictDoUpdate({
        target: passwordCredentials.userId,
        set: { passwordHash, failedLogins: 0, lockedUntil: null },
      });
  }

  async saveLoginAttempts(
    userId: string,
    attempts: LoginAttempts,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db
      .update(passwordCredentials)
      .set(attempts)
      .where(eq(passwordCredentials.userId, userId));
  }

  // Sessions

  async insertSession(
    session: Pick<SessionRow, 'id' | 'userId' | 'expiresAt' | 'lastSeenAt'>,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db.insert(sessions).values(session);
  }

  async findSession(id: string): Promise<SessionRow | undefined> {
    const [row] = await this.db.select().from(sessions).where(eq(sessions.id, id)).limit(1);
    return row;
  }

  async touchSession(id: string, lastSeenAt: Date, expiresAt: Date): Promise<void> {
    await this.db.update(sessions).set({ lastSeenAt, expiresAt }).where(eq(sessions.id, id));
  }

  async deleteSession(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id));
  }

  /** Ends every session of the user, except `keepId` (the one making the request) */
  async deleteSessionsOfUser(
    userId: string,
    keepId: string | null,
    db: DbExecutor = this.db,
  ): Promise<void> {
    const ofUser = eq(sessions.userId, userId);
    await db
      .delete(sessions)
      .where(keepId === null ? ofUser : and(ofUser, ne(sessions.id, keepId)));
  }

  // One-time email tokens

  async insertEmailToken(token: NewEmailToken, db: DbExecutor = this.db): Promise<void> {
    await db.insert(emailTokens).values(token);
  }

  /** Retires the user's unused tokens of this purpose, so only the newest link works */
  async retireEmailTokens(
    userId: string,
    purpose: EmailTokenPurpose,
    now: Date,
    db: DbExecutor = this.db,
  ): Promise<void> {
    await db
      .update(emailTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailTokens.userId, userId),
          eq(emailTokens.purpose, purpose),
          isNull(emailTokens.usedAt),
        ),
      );
  }

  /**
   * Uses up a valid token in one statement, so two concurrent requests cannot both use it.
   * Returns the owner, or null for an unknown, expired, used or wrong-purpose token.
   */
  async consumeEmailToken(
    tokenHash: string,
    purpose: EmailTokenPurpose,
    now: Date,
    db: DbExecutor = this.db,
  ): Promise<string | null> {
    const [row] = await db
      .update(emailTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(emailTokens.tokenHash, tokenHash),
          eq(emailTokens.purpose, purpose),
          isNull(emailTokens.usedAt),
          gt(emailTokens.expiresAt, now),
        ),
      )
      .returning({ userId: emailTokens.userId });
    return row?.userId ?? null;
  }
}
